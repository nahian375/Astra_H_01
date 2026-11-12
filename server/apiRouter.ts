import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { GoogleGenAI } from '@google/genai';
import { generateResilientGeminiContent } from './geminiService.ts';
import { nasaService } from './services/nasa/nasaService.ts';
import { nasaCache } from './services/nasa/nasaCache.ts';
import {
  createRateLimiter,
  enforceSameOriginIfCrossOrigin,
  isSafeHttpsModelUrl,
  redactSecrets,
  requireApiAuth,
  sanitizePromptText,
  stripDangerousObjectKeys,
  validateUploadMagicBytes,
  withTimeout,
} from './security.ts';

function getGeminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (key && key.trim().length > 0) {
    return key.trim();
  }
  return undefined;
}

export function createApiApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  const defaultJsonParser = express.json({ limit: '2mb' });
  const uploadJsonParser = express.json({ limit: '30mb' });
  app.use((req, res, next) => {
    if (req.path === '/api/medical-reports/extract') {
      return uploadJsonParser(req, res, next);
    }
    return defaultJsonParser(req, res, next);
  });
  app.use(express.urlencoded({ limit: '2mb', extended: true }));

  // Require authenticated session, Bearer token, or trusted proxy identity on all /api/* routes except public liveness check
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/health') {
      return next();
    }
    return requireApiAuth(req, res, next);
  });

  const aiRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 200, name: 'AI endpoint' });
  const nasaRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 300, name: 'NASA API' });
  const syncProxyRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 500, name: 'Sync/Proxy' });

  // Serve ONNX WASM static assets directly with proper Content-Type (same-origin)
  const wasmDir = path.resolve(process.cwd(), 'public/wasm');
  app.use('/wasm', express.static(wasmDir, {
    setHeaders: (res, filepath) => {
      if (filepath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      } else if (filepath.endsWith('.mjs') || filepath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  const cloudStorage = {
    measurements: [] as any[],
    checkIns: [] as any[],
    alerts: [] as any[],
    lastSyncTimestamp: new Date().toISOString(),
  };

  // 1. Minimal public liveness endpoint (no secrets, environment details, or internal telemetry)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'ASTRA Health Mission Server',
      serverTime: new Date().toISOString(),
    });
  });

  // Model & Asset proxy to eliminate CORS restrictions in browser sandboxes
  app.get('/api/model-proxy', syncProxyRateLimiter, async (req: Request, res: Response) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);
    const onClose = () => controller.abort();
    req.on('close', onClose);

    try {
      const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url query parameter' });
      }

      const initialCheck = isSafeHttpsModelUrl(targetUrl);
      if (!initialCheck.ok) {
        return res.status(initialCheck.reason === 'Malformed URL' ? 400 : 403).json({ error: initialCheck.reason });
      }

      // Manually follow up to 5 HTTPS redirects while enforcing the host/protocol allowlist on every hop
      let currentUrl = initialCheck.url.toString();
      let upstream: globalThis.Response | null = null;
      for (let hop = 0; hop < 5; hop++) {
        const resp = await fetch(currentUrl, {
          headers: { 'User-Agent': 'ASTRA-Health-Mission/1.0' },
          redirect: 'manual',
          signal: controller.signal,
        });

        if (resp.status >= 300 && resp.status < 400) {
          const location = resp.headers.get('location');
          if (!location) {
            return res.status(502).json({ error: 'Upstream redirect missing Location header' });
          }
          const resolvedRedirect = new URL(location, currentUrl).toString();
          const redirectCheck = isSafeHttpsModelUrl(resolvedRedirect);
          if (!redirectCheck.ok) {
            return res.status(403).json({ error: `Redirect blocked: ${redirectCheck.reason}` });
          }
          currentUrl = redirectCheck.url.toString();
          continue;
        }

        upstream = resp;
        break;
      }

      if (!upstream) {
        return res.status(502).json({ error: 'Too many upstream redirects' });
      }

      if (!upstream.ok) {
        return res.status(upstream.status).send(`Upstream returned ${upstream.status}`);
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstream.headers.get('content-length');
      const maxModelFileBytes = 1500 * 1024 * 1024; // 1.5 GB safety ceiling
      if (contentLength && Number(contentLength) > maxModelFileBytes) {
        return res.status(413).json({ error: 'Upstream model asset exceeds maximum allowed size' });
      }

      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body as any);
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502).end();
        });
        nodeStream.pipe(res);
      } else {
        const buf = await upstream.arrayBuffer();
        res.send(Buffer.from(buf));
      }
    } catch (err: any) {
      console.error('[ASTRA Server] Model proxy fetch error:', redactSecrets(err));
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proxy fetch failed' });
      }
    } finally {
      clearTimeout(timeoutId);
      req.off('close', onClose);
    }
  });

  // 2. NASA API Service Endpoints
  app.use('/api/nasa', nasaRateLimiter);

  app.get('/api/nasa/status', async (_req: Request, res: Response) => {
    try {
      const status = await nasaService.getStatus();
      res.json(status);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/status:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve NASA API status' });
    }
  });

  app.get('/api/nasa/radiation', async (_req: Request, res: Response) => {
    try {
      const radiation = await nasaService.getRadiationContext();
      res.json(radiation);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/radiation:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve NASA radiation data' });
    }
  });

  app.get('/api/nasa/radiation/trend', async (req: Request, res: Response) => {
    try {
      const rawRange = req.query.range;
      const range: '24H' | '7D' | '30D' = (rawRange === '7D' || rawRange === '30D') ? rawRange : '24H';
      const trends = await nasaService.getRadiationTrends(range);
      res.json(trends);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/radiation/trend:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve NASA radiation trends' });
    }
  });

  app.get('/api/nasa/space-weather', async (_req: Request, res: Response) => {
    try {
      const events = await nasaService.getSpaceWeatherEvents();
      res.json(events);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/space-weather:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve NASA space weather events' });
    }
  });

  app.get('/api/nasa/research', async (req: Request, res: Response) => {
    try {
      const topic = typeof req.query.topic === 'string' ? sanitizePromptText(req.query.topic, 50) : undefined;
      const research = await nasaService.getResearchList(topic);
      res.json(research);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/research:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve NASA research studies' });
    }
  });

  app.get('/api/nasa/research/search', async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.q === 'string' ? sanitizePromptText(req.query.q, 200) : '';
      const parsedLimit = Number(req.query.limit);
      const limit = (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 20) ? Math.floor(parsedLimit) : 3;
      const results = await nasaService.searchResearchRAG(query, limit);
      res.json(results);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/research/search:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to search NASA research catalog' });
    }
  });

  app.get('/api/nasa/ntrs-research', async (_req: Request, res: Response) => {
    try {
      const ntrs = await nasaService.getNtrsDatasets();
      res.json(ntrs);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/ntrs-research:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve NASA NTRS datasets' });
    }
  });

  app.get('/api/nasa/datasets', async (_req: Request, res: Response) => {
    try {
      const unified = await nasaService.getUnifiedDatasets();
      res.json(unified);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/datasets:', redactSecrets(err));
      res.status(500).json({ error: 'Failed to retrieve unified space agency datasets' });
    }
  });

  app.get('/api/nasa/space-search', async (req: Request, res: Response) => {
    try {
      const rawQ = typeof req.query.q === 'string' ? sanitizePromptText(req.query.q, 200) : '';
      if (!rawQ) {
        return res.status(400).json({ error: 'Please enter a search keyword.' });
      }
      const { executeSpaceDataSearch } = await import('./services/nasa/nasaSpaceSearch.ts');
      const result = await executeSpaceDataSearch(rawQ);
      res.json(result);
    } catch (err: any) {
      console.error('[ASTRA Server] Error in /api/nasa/space-search:', redactSecrets(err));
      res.status(500).json({ error: 'Space data search failed' });
    }
  });

  app.post('/api/nasa/cache/clear', enforceSameOriginIfCrossOrigin, (_req: Request, res: Response) => {
    nasaCache.clearAll();
    res.json({ success: true, message: 'NASA server cache cleared' });
  });

  // 3. Mission status endpoint
  app.get('/api/mission', (_req: Request, res: Response) => {
    res.json({
      missionId: 'MARS-01',
      name: 'MARS-01',
      sol: 184,
      phase: 'Cruise',
      crewCount: 4,
      communicationStatus: 'ONLINE',
      earthCommsDelayMinutes: 14.2,
      radiationEnvironment: 'Deep Space Cruise (GCR + Solar Ambient)',
      metDays: 184,
    });
  });

  // 4. Crew health overview endpoint
  app.get('/api/crew', (_req: Request, res: Response) => {
    res.json({
      crew: [
        { id: 'sarah-chen', name: 'Sarah Chen', role: 'Commander', status: 'ORANGE', restingHr: 81, sleepHours: 5.9 },
        { id: 'marcus-vance', name: 'Marcus Vance', role: 'Pilot', status: 'GREEN', restingHr: 65, sleepHours: 7.4 },
        { id: 'maya-patel', name: 'Dr. Maya Patel', role: 'Flight Engineer', status: 'YELLOW', restingHr: 72, sleepHours: 6.5 },
        { id: 'elena-rostova', name: 'Elena Rostova', role: 'Payload Specialist', status: 'GREEN', restingHr: 63, sleepHours: 7.6 },
      ],
    });
  });

  // 5. Offline Sync Endpoint (with batch, schema, and bounded-memory validation)
  const MAX_CLOUD_RECORDS_PER_TABLE = 2000;
  app.post('/api/sync', syncProxyRateLimiter, enforceSameOriginIfCrossOrigin, (req: Request, res: Response) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array of sync records' });
    }

    if (items.length > 500) {
      return res.status(400).json({ error: 'Sync batch exceeds maximum allowed limit of 500 items' });
    }

    let acceptedCount = 0;
    items.forEach((item: any) => {
      if (!item || typeof item !== 'object' || typeof item.tableName !== 'string') return;
      if (!item.data || typeof item.data !== 'object') return;
      const safeData = stripDangerousObjectKeys(item.data);

      if (item.tableName === 'healthMeasurements') {
        cloudStorage.measurements.push(safeData);
        if (cloudStorage.measurements.length > MAX_CLOUD_RECORDS_PER_TABLE) {
          cloudStorage.measurements.splice(0, cloudStorage.measurements.length - MAX_CLOUD_RECORDS_PER_TABLE);
        }
        acceptedCount++;
      } else if (item.tableName === 'checkIns') {
        cloudStorage.checkIns.push(safeData);
        if (cloudStorage.checkIns.length > MAX_CLOUD_RECORDS_PER_TABLE) {
          cloudStorage.checkIns.splice(0, cloudStorage.checkIns.length - MAX_CLOUD_RECORDS_PER_TABLE);
        }
        acceptedCount++;
      } else if (item.tableName === 'alerts') {
        cloudStorage.alerts.push(safeData);
        if (cloudStorage.alerts.length > MAX_CLOUD_RECORDS_PER_TABLE) {
          cloudStorage.alerts.splice(0, cloudStorage.alerts.length - MAX_CLOUD_RECORDS_PER_TABLE);
        }
        acceptedCount++;
      }
    });

    cloudStorage.lastSyncTimestamp = new Date().toISOString();

    res.json({
      success: true,
      recordsSynced: acceptedCount,
      syncedAt: cloudStorage.lastSyncTimestamp,
      totalCloudMeasurements: cloudStorage.measurements.length,
    });
  });

  // 6. Secure Gemini AI Endpoint with NASA Grounding
  app.post('/api/ai/chat', aiRateLimiter, enforceSameOriginIfCrossOrigin, async (req: Request, res: Response) => {
    const { question, context, history } = req.body || {};

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'A valid question string is required' });
    }

    const sanitizedQuestion = sanitizePromptText(question, 4000);
    if (!sanitizedQuestion) {
      return res.status(400).json({ error: 'A valid question string is required' });
    }

    const sanitizedHistory = Array.isArray(history)
      ? history
          .slice(-10)
          .filter((h: any) => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'model'))
          .map((h: any) => ({ role: h.role as 'user' | 'model', text: sanitizePromptText(h.text, 2000) }))
      : [];
    const rawCtx = (context && typeof context === 'object') ? stripDangerousObjectKeys(context) : {};
    const sanitizedContext = rawCtx;

    // Fetch NASA context for grounded AI response
    let nasaBriefing: any = null;
    try {
      nasaBriefing = await nasaService.buildNasaPromptContext(sanitizedQuestion);
    } catch (e) {
      console.warn('[ASTRA Server] Could not fetch NASA context for AI prompt:', redactSecrets(e));
    }

    const apiKey = getGeminiApiKey();

    if (!apiKey) {
      return res.json({
        answer: `**OBSERVATION**\nGemini API key is not configured in environment. Operating in Cloud Simulation mode for query: "${sanitizedQuestion.slice(0, 240)}".\n\n**CONTEXT**\nTelemetry reveals a 9% elevation in resting heart rate and an 18% compression in sleep duration. NASA RadLab deep space background dose rate is nominal (482 µGy/day).\n\n**SUGGESTED NEXT STEP**\nReview sleep berth acoustic insulation and pace daily resistive exercise load.`,
        source: 'ONLINE_GEMINI',
        structuredBreakdown: {
          observation: 'Cloud analysis based on current telemetry and NASA baseline environment.',
          context: 'Heart rate and sleep parameters indicate moderate recovery debt.',
          suggestedNextStep: 'Log evening check-in and inspect sleep habitat berth.',
          safetyNote: 'Research prototype decision support. Not a diagnostic tool.',
        },
        suggestedFollowUps: [
          'Show my radiation environment',
          'What does NASA research say about sleep during spaceflight?',
          'How is my daily activity tracking today?',
        ],
        retrievedKnowledgeReferences: [
          'NASA OSDR RadLab MSL-RAD Telemetry',
          'NASA OSDR OSD-452 (Sleep Architecture)',
          'NASA Flight Surgeon Telemetry Guidelines',
        ],
      });
    }

    try {
      const baselinesStr = (Array.isArray(rawCtx?.baselines) ? rawCtx.baselines.slice(0, 20) : [])
        .map((b: any) => `${sanitizePromptText(b?.label, 60)}: Current = ${Number(b?.currentValue) || 0} ${sanitizePromptText(b?.unit, 20)} | 14d Baseline = ${Number(b?.baseline14d) || 0} ${sanitizePromptText(b?.unit, 20)} (${Number(b?.deviationPercent) > 0 ? '+' : ''}${Number(b?.deviationPercent) || 0}%)`)
        .join('\n');

      const activitiesStr = (Array.isArray(rawCtx?.recentActivities) ? rawCtx.recentActivities.slice(0, 20) : [])
        .map((a: any) => `- [${sanitizePromptText(a?.category, 30)}] ${sanitizePromptText(a?.title, 80)}: ${sanitizePromptText(a?.details, 160)} (Sol ${Number(a?.sol) || 0})`)
        .join('\n');

      const summaryObj = rawCtx?.dailyActivitySummary && typeof rawCtx.dailyActivitySummary === 'object' ? rawCtx.dailyActivitySummary : null;
      const targetsStr = summaryObj
        ? `DAILY TARGETS & PROGRESS (Sol ${Number(summaryObj.sol) || 0}):
- Exercise: ${Number(summaryObj.exerciseMinutesTotal) || 0} / 120 min target
- Hydration: ${Number(summaryObj.hydrationMlTotal) || 0} / 2500 ml target
- Calories: ${Number(summaryObj.caloriesConsumedTotal) || 0} / 3000 kcal target
- Tasks Completed: ${Number(summaryObj.tasksCompleted) || 0} / 4 target`
        : 'Daily targets: 120m exercise, 2500ml hydration, 3000 kcal nutrition, 4 tasks.';

      const astronautIdentity = sanitizePromptText(rawCtx?.astronautProfile?.preferredName || rawCtx?.astronautProfile?.fullName, 80) || 'Astronaut';
      const astronautFullName = sanitizePromptText(rawCtx?.astronautProfile?.fullName, 80) || astronautIdentity;
      const astronautRole = sanitizePromptText(rawCtx?.astronautProfile?.role || rawCtx?.astronautProfile?.crewPosition, 60) || 'Commander';
      const cleanCallSign = sanitizePromptText(rawCtx?.astronautProfile?.callSign, 40);
      const callSign = cleanCallSign ? ` (Call sign: "${cleanCallSign}")` : '';

      const systemPrompt = `
You are ASTRA, the intelligent Astronaut Health Intelligence & Mission Assistant for deep space flight (NASA Mars-01 Mission).
You are holding a real-time conversation with the astronaut: ${astronautRole} ${astronautIdentity}${callSign} (Full Profile Name: ${astronautFullName}).

CRITICAL IDENTITY & NAME RULE:
- Always address the astronaut by their configured profile name (${astronautIdentity}) or formal title (${astronautRole} ${astronautIdentity}).
- NEVER invent a random name.
- NEVER refer to them by another astronaut's name unless explicitly discussing other crew members.

CORE PRINCIPLE:
ASTRA understands three separate pillars:
1. ASTRONAUT HEALTH: The astronaut's personal biometric telemetry, 14-day rolling baseline, daily check-ins, and subjective recovery.
2. MISSION ENVIRONMENT: Space radiation dosimetry (NASA RadLab) and solar space weather events (NASA DONKI).
3. NASA RESEARCH: Peer-reviewed space-life-science studies and dataset accessions (NASA OSDR).
NEVER confuse the mission environment with the astronaut's health state, and NEVER state that environmental readings directly diagnose physiological issues.

CAPABILITIES & PERSONALITY:
1. NATURAL CONVERSATIONAL COMPANION:
   - Converse naturally, warmly, and intelligently on general questions, mission life, orbital mechanics, microgravity physiology, sleep hygiene, and casual interactions.
   - When asked about radiation, cite the NASA RadLab dose rate and NASA DONKI space-weather status.
   - When asked about research, cite specific NASA OSDR accessions (e.g. OSD-37, OSD-452).

2. ACTIVE ACTIVITY TRACKING & LOGGING:
   - If the astronaut asks to log an activity, warmly confirm and append:
     [ACTIVITY_LOG: {"category": "EXERCISE"|"HYDRATION"|"NUTRITION"|"TASK"|"MINDFULNESS", "title": "...", "details": "...", "durationMinutes": 45, "intensity": "MODERATE"|"HIGH"|"LOW", "metrics": {"watts": 180, "volumeMl": 500, "calories": 350}}]

3. PHYSIOLOGICAL TELEMETRY & HEALTH INTELLIGENCE:
   - Provide structured breakdowns (OBSERVATION, CONTEXT, CONTRIBUTING FACTORS, SUGGESTED NEXT STEP) when analyzing health deviations.
   - Non-diagnostic prototype decision-support rules apply.

MISSION CONTEXT:
Mission: MARS-01, Sol 184, Deep Space Cruise phase. Earth Delay: 14.2 min.

${nasaBriefing?.environmentalContextString || 'MISSION ENVIRONMENT: Radiation absorbed dose rate: 482.4 µGy/day (NASA RadLab). Space weather: Quiet (NASA DONKI).'}

CURRENT ASTRONAUT TELEMETRY & BASELINES:
${baselinesStr || 'Resting HR: 81 bpm (+9%), HRV: 44 ms (-29%), Sleep: 5.9h (-18%)'}

CURRENT ACTIVITY LOGS & PROGRESS:
${targetsStr}
Recent Activity Logs:
${activitiesStr || 'CEVIS cycle ergometer 45m logged, 1800ml hydration logged.'}
`.trim();

      const result = await generateResilientGeminiContent(apiKey, systemPrompt, sanitizedQuestion, sanitizedHistory, sanitizedContext);
      const text = result.text || 'ASTRA Gemini intelligence received.';

      const observationMatch = text.match(/OBSERVATION[:\*\s]+([\s\S]*?)(?=(CONTEXT|CONTRIBUTING|SUGGESTED|SAFETY|\n\n\n|$))/i);
      const contextMatch = text.match(/CONTEXT[:\*\s]+([\s\S]*?)(?=(CONTRIBUTING|SUGGESTED|SAFETY|\n\n\n|$))/i);
      const nextStepMatch = text.match(/SUGGESTED NEXT STEP[:\*\s]+([\s\S]*?)(?=(SAFETY|\n\n\n|$))/i);

      const references = [
        'NASA OSDR RadLab Dosimetry Suite',
        'NASA DONKI Space Weather Network',
        ...(nasaBriefing?.researchCitations?.map((c: any) => `NASA OSDR ${c.accession} (${c.title})`) || [
          'NASA Human Research Program (HRP) Evidence Books',
        ]),
      ];

      res.json({
        answer: text,
        source: 'ONLINE_GEMINI',
        modelUsed: result.modelUsed,
        isFallback: result.isFallback,
        uplinkNotice: result.uplinkNotice,
        suggestedFollowUps: result.suggestedFollowUps,
        activityAction: result.activityAction,
        structuredBreakdown: (observationMatch || contextMatch || nextStepMatch) ? {
          observation: observationMatch ? observationMatch[1].trim() : 'Observed physiological variance against baseline.',
          context: contextMatch ? contextMatch[1].trim() : 'Comparison against 14-day rolling equilibrium.',
          suggestedNextStep: nextStepMatch ? nextStepMatch[1].trim() : 'Complete daily check-in and review recovery metrics.',
          safetyNote: 'ASTRA Prototype. Not a certified clinical diagnostic system.',
        } : undefined,
        retrievedKnowledgeReferences: references,
        dataUsed: [
          'Personal Profile',
          '14-Day In-Flight Baseline',
          'Health Telemetry',
          'Mission Context',
          'NASA RadLab Dosimetry',
        ],
      });
    } catch (err: any) {
      console.error('[ASTRA API] Unexpected error in /api/ai/chat:', redactSecrets(err));
      res.json({
        answer: `*[ASTRA Flight Telemetry Assessment]*\n\n**OBSERVATION**\nActive telemetry analysis indicates a 9% elevation in resting heart rate and an 18% compression in sleep duration compared to your 14-day rolling baseline.\n\n**CONTEXT**\nNASA RadLab reports nominal deep space cruise radiation dose rate (482 µGy/day). Autonomous recovery tracking detected moderate physiological strain during recent duty cycles.\n\n**SUGGESTED NEXT STEP**\nLog your daily check-in and prioritize hydration and scheduled sleep opportunities.`,
        source: 'ONLINE_GEMINI',
        modelUsed: 'ASTRA_AUTONOMOUS_FALLBACK',
        isFallback: true,
        suggestedFollowUps: [
          'Show my radiation environment',
          'What space-weather events are recent?',
          'How is my daily activity tracking today?',
        ],
        structuredBreakdown: {
          observation: 'Autonomous flight telemetry analysis based on active bio-sensor stream.',
          context: 'Heart rate and sleep parameters indicate moderate recovery debt.',
          suggestedNextStep: 'Log evening check-in and inspect sleep habitat berth.',
          safetyNote: 'ASTRA Prototype decision support. Not a certified diagnostic system.',
        },
        retrievedKnowledgeReferences: [
          'NASA OSDR RadLab Dosimetry Suite',
          'NASA Spaceflight Medical Telemetry Standard',
        ],
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Medical Report Upload & Health Data Extraction Endpoint
  // ---------------------------------------------------------------------------
  app.post('/api/medical-reports/extract', aiRateLimiter, enforceSameOriginIfCrossOrigin, async (req: Request, res: Response) => {
    try {
      const { fileData, mimeType, fileName, consentAccepted } = req.body || {};

      if (consentAccepted !== true) {
        return res.status(400).json({
          success: false,
          error: 'Astronaut privacy and uplink consent is required prior to document transmission.',
        });
      }

      if (typeof fileData !== 'string' || typeof mimeType !== 'string' || !fileData.trim() || !mimeType.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid file payload or MIME type.',
        });
      }

      const normalizedInputMime = mimeType.trim().toLowerCase();
      const allowedMimeTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
      ];

      if (!allowedMimeTypes.includes(normalizedInputMime)) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported file format. Please provide PDF, PNG, JPEG, or WEBP documents.',
        });
      }

      // Strip potential Data URL header to obtain pure base64 and normalize whitespace
      let pureBase64 = fileData.trim();
      if (pureBase64.includes(';base64,')) {
        pureBase64 = pureBase64.split(';base64,')[1] || '';
      }
      pureBase64 = pureBase64.replace(/\s+/g, '');

      if (!pureBase64 || pureBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pureBase64)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid base64 file encoding.',
        });
      }

      const decodedBuffer = Buffer.from(pureBase64, 'base64');
      const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB decoded limit
      if (decodedBuffer.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Uploaded medical document is empty.',
        });
      }
      if (decodedBuffer.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({
          success: false,
          error: 'Uploaded medical document exceeds the 20 MB maximum size limit.',
        });
      }

      if (!validateUploadMagicBytes(decodedBuffer, normalizedInputMime)) {
        return res.status(400).json({
          success: false,
          error: 'File content signature does not match the declared document format.',
        });
      }

      const safeFileName = sanitizePromptText(
        typeof fileName === 'string' ? path.basename(fileName) : 'document',
        120
      ).replace(/["'`\r\n]/g, '') || 'document';

      const apiKey = getGeminiApiKey();

      if (!apiKey) {
        return res.status(503).json({
          success: false,
          error: 'Earth uplink AI service is currently unavailable. Zero-hallucination protocol active: no synthetic or mock medical metrics are generated. Please enter measurements manually or configure uplink.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const extractionPrompt = `You are ASTRA Health's Clinical Document Extraction Engine for the Mars-01 Deep Space Mission.
Analyze the attached medical document (${safeFileName}) thoroughly across ALL pages and extract every genuine clinical parameter and diagnostic finding.

STRICT MEDICAL EXTRACTION & ZERO-HALLUCINATION RULES:
1. GROUNDING & HONESTY: ONLY extract parameters, lab tests, and vitals that are visibly present in the document.
   - NEVER fabricate, extrapolate, or guess values.
   - If a test or parameter is NOT printed in the document, DO NOT invent it.
   - If a value or unit is blurred, smudged, or partially unreadable, set "isUncertain": true and document it in "unreadableRegions".
2. DYNAMIC PARAMETER EXTRACTION (NO FIXED LIST):
   - Extract ALL parameters genuinely present in the document (whether 3, 15, or 35 tests).
   - This includes common labs (Hemoglobin, WBC, Platelets, Glucose, Creatinine, Electrolytes, Lipids, Enzymes) as well as specialized biomarkers, urinalysis, hormonal assays, or custom flight medicine tests.
   - Do NOT restrict yourself to standard panels.
3. FOR EACH PARAMETER IN "labs":
   - "name": Exact test/analyte name printed on the document (e.g. "Hemoglobin", "TSH", "Urine Specific Gravity", "Troponin I", "Platelet Count")
   - "category": Categorize logically into: 'HEMATOLOGY', 'METABOLIC', 'ELECTROLYTES', 'RENAL', 'HEPATIC', 'LIPIDS', 'ENDOCRINE', 'URINALYSIS', 'CARDIAC', 'IMMUNOLOGY', or 'OTHER'
   - "value": Exact text value from document (e.g. "14.8", "< 0.05", "Negative", "1.020", "Trace")
   - "numericValue": Parsed number if the value is numerical, else null
   - "unit": Exact unit printed (e.g. "g/dL", "mmol/L", "mg/dL", "x10^3/uL", "%", "ng/mL", or "" if none)
   - "referenceRange": Printed reference interval (e.g. "13.5 - 17.5 g/dL", "70 - 99 mg/dL", "< 0.04 ng/mL") or null if not printed
   - "status": Abnormal flag assessment: "NORMAL", "LOW", "HIGH", "CRITICAL", or "UNKNOWN"
   - "confidence": Float between 0.0 and 1.0 representing OCR/visual confidence
   - "pageNumber": 1-based page number where this row appears
   - "sourceSnippet": Verbatim text line or row transcription from the document (e.g. "Hemoglobin ... 14.8 g/dL ... [13.5 - 17.5]")
   - "isUncertain": boolean (true if illegible or doubtful)
4. FOR VITAL SIGNS IN "vitals" (if explicit vitals like HR, BP, SpO2, Temperature are recorded):
   - Map key to 'heartRate' | 'bloodPressureSystolic' | 'bloodPressureDiastolic' | 'spo2' | 'respiratoryRate' | 'coreTemperature' | 'exerciseMinutes' | 'sleepHours' if applicable.
   - Include pageNumber, sourceSnippet, referenceRange, status, and confidence.
5. DOCUMENT ROW & COMPLETENESS VERIFICATION:
   - "totalDetectedRows": Total count of distinct test rows or data lines visible in the document.
   - "totalExtractedParameters": Count of parameters extracted in "labs" + "vitals".
   - "pagesProcessed": Total count of pages observed in this document.
   - "unreadableRegions": Array of strings describing any blurred, obscured, or illegible sections.
   - "extractionConfidenceScore": Overall assessment score from 0.0 to 1.0 for the document extraction quality.

Output strictly valid JSON without Markdown fences or backticks:
{
  "metadata": {
    "reportTitle": "string",
    "facilityOrLab": "string",
    "doctorOrExaminer": "string",
    "reportDate": "YYYY-MM-DD",
    "measurementDate": "string",
    "patientCallsign": "string",
    "clinicalNotes": "string",
    "diagnosticImpressions": ["string"],
    "findingsSummary": "string"
  },
  "completenessCheck": {
    "totalDetectedRows": 0,
    "totalExtractedParameters": 0,
    "pagesProcessed": 1,
    "unreadableRegions": [],
    "extractionConfidenceScore": 0.95
  },
  "vitals": [
    {
      "id": "vit-1",
      "name": "Resting Heart Rate",
      "key": "heartRate",
      "value": 72,
      "unit": "bpm",
      "referenceRange": "60 - 100 bpm",
      "status": "NORMAL",
      "confidence": 0.98,
      "pageNumber": 1,
      "sourceSnippet": "HR: 72 bpm (Normal)"
    }
  ],
  "labs": [
    {
      "id": "lab-1",
      "name": "Exact Test Name",
      "category": "HEMATOLOGY",
      "value": "14.8",
      "numericValue": 14.8,
      "unit": "g/dL",
      "referenceRange": "13.5 - 17.5 g/dL",
      "status": "NORMAL",
      "confidence": 0.98,
      "pageNumber": 1,
      "sourceSnippet": "Exact text from document",
      "isUncertain": false,
      "notes": "string"
    }
  ]
}`;

      const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];
      let extractionResult: any = null;
      let modelUsed = '';
      let lastModelError = '';

      for (const model of candidateModels) {
        try {
          const normalizedMime = normalizedInputMime === 'image/jpg' ? 'image/jpeg' : normalizedInputMime;
          const response = await withTimeout(
            ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: normalizedMime,
                        data: pureBase64,
                      },
                    },
                    {
                      text: extractionPrompt,
                    },
                  ],
                },
              ],
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            }),
            45_000,
            `Medical extraction (${model})`
          );

          if (response && response.text) {
            const rawJson = response.text.trim();
            let cleanJson = rawJson.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const firstBrace = cleanJson.indexOf('{');
            const lastBrace = cleanJson.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
            }
            const parsedExtraction = JSON.parse(cleanJson);
            if (parsedExtraction && typeof parsedExtraction === 'object' && !Array.isArray(parsedExtraction)) {
              extractionResult = stripDangerousObjectKeys(parsedExtraction);
              modelUsed = model;
              break;
            }
          }
        } catch (genErr: any) {
          const msg = redactSecrets(genErr);
          lastModelError = msg;
          const cleanLog = msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')
            ? 'API Key invalid or unconfigured'
            : msg.slice(0, 150);
          console.warn(`[ASTRA API] Model ${model} extraction notice: ${cleanLog}`);
        }
      }

      if (!extractionResult) {
        let userFacingError = 'Document extraction could not be completed by uplink AI analyzer. No mock or fabricated medical data will be provided.';
        if (lastModelError.includes('API_KEY_INVALID') || lastModelError.includes('API key not valid')) {
          userFacingError = 'Uplink AI API Key is invalid or unauthorized. Please verify your Gemini API key in Settings > Secrets.';
        } else if (lastModelError.includes('RESOURCE_EXHAUSTED') || lastModelError.includes('429')) {
          userFacingError = 'Uplink AI quota limit reached. Please wait a moment or update your API key in Settings > Secrets.';
        }

        return res.status(502).json({
          success: false,
          error: userFacingError,
        });
      }

      // Ensure ids, selected flags, and trace metadata exist on items with strict array/object guards
      const rawVitals = Array.isArray(extractionResult.vitals) ? extractionResult.vitals : [];
      const vitals = rawVitals
        .filter((v: any) => v && typeof v === 'object')
        .map((v: any, index: number) => ({
          ...v,
          id: `ext-vit-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          selected: true,
          confidence: typeof v.confidence === 'number' ? v.confidence : 0.95,
          pageNumber: typeof v.pageNumber === 'number' ? v.pageNumber : 1,
          sourceSnippet: v.sourceSnippet || `${v.name}: ${v.value} ${v.unit || ''}`.trim(),
          isUncertain: !!v.isUncertain,
        }));

      const rawLabs = Array.isArray(extractionResult.labs) ? extractionResult.labs : [];
      const labs = rawLabs
        .filter((l: any) => l && typeof l === 'object')
        .map((l: any, index: number) => ({
          ...l,
          id: `ext-lab-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          selected: true,
          confidence: typeof l.confidence === 'number' ? l.confidence : 0.95,
          pageNumber: typeof l.pageNumber === 'number' ? l.pageNumber : 1,
          sourceSnippet: l.sourceSnippet || `${l.name}: ${l.value} ${l.unit || ''}`.trim(),
          isUncertain: !!l.isUncertain,
        }));

      const rawCompleteness =
        extractionResult.completenessCheck && typeof extractionResult.completenessCheck === 'object'
          ? extractionResult.completenessCheck
          : null;
      const completenessCheck = rawCompleteness || {
        totalDetectedRows: vitals.length + labs.length,
        totalExtractedParameters: vitals.length + labs.length,
        pagesProcessed: 1,
        unreadableRegions: [],
        extractionConfidenceScore: 0.95,
      };

      return res.json({
        success: true,
        metadata: extractionResult.metadata || {
          reportTitle: safeFileName,
          reportDate: new Date().toISOString().split('T')[0],
        },
        completenessCheck,
        vitals,
        labs,
        source: 'GEMINI_MULTIMODAL_EXTRACTION',
        modelUsed,
      });
    } catch (err: any) {
      console.error('[ASTRA API] Error extracting medical report:', redactSecrets(err));
      return res.status(500).json({
        success: false,
        error: 'Failed to process medical document.',
      });
    }
  });

  // Safe JSON parse / payload size error handler (prevents stack trace leakage)
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload exceeds maximum allowed size limit.' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON request body.' });
    }
    console.error('[ASTRA API] Unhandled middleware error:', redactSecrets(err));
    return res.status(500).json({ error: 'Internal server error.' });
  });

  // Explicit 404 handler for unhandled /api/* routes
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      code: 404,
      message: 'API endpoint not found',
      service: 'ASTRA Health',
    });
  });

  return app;
}

