/**
 * ASTRA Health - Unified NASA Space Data Search Service
 * Server-side proxy & intent router across all 12 NASA MCP tools:
 * - APOD (get_apod, search_apod_archive)
 * - NEO Asteroids (get_asteroids_this_week, find_closest_asteroids, check_asteroid_hazard)
 * - Active Fires (get_active_fires, query_fire_hotspots)
 * - DONKI Space Weather (get_solar_flares, get_cmes, get_geomagnetic_storms)
 * - Climate Indicators (get_climate_indicator)
 * - Biological & Physical Sciences (search_bio_experiments)
 */

import { searchNasaResearchRAG } from './nasaOsdr.ts';
import { redactSecrets } from '../../security.ts';
import type {
  SpaceSearchToolId,
  SpaceSearchResultItem,
  SpaceSearchResponse,
} from '../../../src/types/spaceSearch.ts';

function getNasaApiKey(): string {
  const key = process.env.NASA_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : 'DEMO_KEY';
}

function extractDateFromQuery(query: string): string | undefined {
  const match = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match ? match[1] : undefined;
}

function extractHtmlMeta(html: string): { title: string; description: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);

  const decodeEntities = (str: string) =>
    str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

  return {
    title: titleMatch ? decodeEntities(titleMatch[1]) : '',
    description: descMatch ? decodeEntities(descMatch[1]) : '',
  };
}

export function classifySpaceSearchIntent(rawQuery: string): SpaceSearchToolId[] {
  const q = rawQuery.toLowerCase().trim();
  const tools = new Set<SpaceSearchToolId>();

  if (/\b(apod|picture of the day|astronomy picture|space photo|nebula|galaxy|archive)\b/.test(q)) {
    tools.add(q.includes('archive') || q.includes('recent') || q.includes('list') ? 'search_apod_archive' : 'get_apod');
  }

  if (/\b(asteroid|asteroids|neo|near earth|meteor|planetary defense|close approach|closest|hazard|hazardous)\b/.test(q)) {
    if (q.includes('closest')) tools.add('find_closest_asteroids');
    else if (q.includes('hazard')) tools.add('check_asteroid_hazard');
    else tools.add('get_asteroids_this_week');
  }

  if (/\b(fire|fires|wildfire|wildfires|hotspot|hotspots|thermal|firms|modis|viirs|smoke)\b/.test(q)) {
    tools.add(q.includes('hotspot') ? 'query_fire_hotspots' : 'get_active_fires');
  }

  if (/\b(flare|flares|solar flare|flr|x-ray)\b/.test(q)) {
    tools.add('get_solar_flares');
  }

  if (/\b(cme|cmes|coronal mass|ejection)\b/.test(q)) {
    tools.add('get_cmes');
  }

  if (/\b(geomagnetic|gst|kp|aurora|magnetosphere)\b/.test(q)) {
    tools.add('get_geomagnetic_storms');
  }

  if (/\b(space weather|solar storm|solar)\b/.test(q) && !tools.has('get_solar_flares') && !tools.has('get_cmes') && !tools.has('get_geomagnetic_storms')) {
    tools.add('get_solar_flares');
    tools.add('get_cmes');
    tools.add('get_geomagnetic_storms');
  }

  if (/\b(climate|gistemp|sea level|carbon|co2|global warming|ice|methane|temperature)\b/.test(q)) {
    tools.add('get_climate_indicator');
  }

  if (/\b(bio|biology|biological|experiment|experiments|iss|gene|plant|plants|microgravity|cardio|bone|muscle|sleep|radiation|immune)\b/.test(q)) {
    tools.add('search_bio_experiments');
  }

  // Fallback for general keywords: query APOD + Bio/OSDR research
  if (tools.size === 0) {
    tools.add('get_apod');
    tools.add('search_bio_experiments');
  }

  return Array.from(tools);
}

async function fetchWithTimeout(url: string, timeoutMs = 6500): Promise<globalThis.Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, text/html' },
    });
  } finally {
    clearTimeout(id);
  }
}

async function runApodTool(toolId: SpaceSearchToolId, query: string, apiKey: string): Promise<{ items: SpaceSearchResultItem[]; notice?: string }> {
  const params = new URLSearchParams({ api_key: apiKey });
  const explicitDate = extractDateFromQuery(query);
  if (explicitDate) {
    params.set('date', explicitDate);
  } else if (toolId === 'search_apod_archive' || /\b(archive|recent|multiple|gallery|photos)\b/i.test(query)) {
    params.set('count', '4');
  }

  let res = await fetchWithTimeout(`https://api.nasa.gov/planetary/apod?${params.toString()}`);
  // If explicit or server date is ahead of NASA APOD's current day, retry without date param
  if (!res.ok && params.has('date')) {
    params.delete('date');
    res = await fetchWithTimeout(`https://api.nasa.gov/planetary/apod?${params.toString()}`);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`NASA APOD API HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`);
  }

  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : [raw];
  const items: SpaceSearchResultItem[] = list.map((d: any, idx: number) => ({
    kind: 'apod',
    id: `apod-${d.date || idx}-${Date.now()}`,
    toolId,
    title: d.title || 'Astronomy Picture of the Day',
    date: d.date || new Date().toISOString().split('T')[0],
    explanation: d.explanation || '',
    mediaType: d.media_type === 'video' ? 'video' : 'image',
    url: d.url || '',
    hdUrl: d.hdurl,
    copyright: d.copyright ? String(d.copyright).trim() : undefined,
    sourceLabel: 'NASA APOD API',
  }));
  return { items };
}

async function runAsteroidTool(toolId: SpaceSearchToolId, query: string, apiKey: string): Promise<{ items: SpaceSearchResultItem[]; notice?: string }> {
  const params = new URLSearchParams({ api_key: apiKey });
  const explicitDate = extractDateFromQuery(query);
  if (explicitDate) {
    params.set('start_date', explicitDate);
    params.set('end_date', explicitDate);
  }

  const res = await fetchWithTimeout(`https://api.nasa.gov/neo/rest/v1/feed?${params.toString()}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`NASA NeoWs API HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`);
  }

  const data = await res.json();
  const neoMap = data?.near_earth_objects || {};
  const flattened: any[] = [];
  for (const dateKey of Object.keys(neoMap)) {
    const arr = neoMap[dateKey];
    if (Array.isArray(arr)) {
      arr.forEach((neo) => flattened.push(neo));
    }
  }

  const parsed = flattened.map((neo: any) => {
    const approach = neo.close_approach_data?.[0];
    const diamM = neo.estimated_diameter?.meters || {};
    return {
      kind: 'asteroid' as const,
      id: `neo-${neo.id || neo.neo_reference_id}`,
      toolId,
      name: neo.name || 'Unknown NEO',
      closeApproachDate: approach?.close_approach_date_full || approach?.close_approach_date || 'Unknown',
      diameterMinMeters: Math.round(Number(diamM.estimated_diameter_min || 0)),
      diameterMaxMeters: Math.round(Number(diamM.estimated_diameter_max || 0)),
      velocityKmh: Math.round(Number(approach?.relative_velocity?.kilometers_per_hour || 0)),
      missDistanceKm: Math.round(Number(approach?.miss_distance?.kilometers || 0)),
      missDistanceLunar: Number(Number(approach?.miss_distance?.lunar || 0).toFixed(2)),
      isHazardous: Boolean(neo.is_potentially_hazardous_asteroid),
      nasaJplUrl: neo.nasa_jpl_url,
      sourceLabel: 'NASA NeoWs Feed',
    };
  });

  if (toolId === 'find_closest_asteroids') {
    parsed.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
  } else if (toolId === 'check_asteroid_hazard') {
    parsed.sort((a, b) => Number(b.isHazardous) - Number(a.isHazardous) || a.missDistanceKm - b.missDistanceKm);
  } else {
    parsed.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
  }

  return { items: parsed.slice(0, 8) };
}

async function runFiresTool(toolId: SpaceSearchToolId, apiKey: string): Promise<{ items: SpaceSearchResultItem[]; notice?: string }> {
  // Attempt NASA FIRMS endpoint first; note FIRMS requires a separate 32-char MAP_KEY
  try {
    const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(apiKey)}/VIIRS_SNPP_NRT/world/1`;
    const res = await fetchWithTimeout(firmsUrl, 4500);
    if (res.ok) {
      const csvText = await res.text();
      if (csvText && csvText.includes('latitude,longitude') && !csvText.includes('Invalid MAP_KEY')) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const latIdx = headers.indexOf('latitude');
        const lonIdx = headers.indexOf('longitude');
        const brightIdx = headers.indexOf('bright_ti4');
        const dateIdx = headers.indexOf('acq_date');
        const timeIdx = headers.indexOf('acq_time');
        const satIdx = headers.indexOf('satellite');
        const confIdx = headers.indexOf('confidence');

        const items: SpaceSearchResultItem[] = lines.slice(1, 9).map((line, i) => {
          const cols = line.split(',');
          return {
            kind: 'fire',
            id: `firms-${i}-${cols[latIdx]}-${cols[lonIdx]}`,
            toolId,
            title: `VIIRS Thermal Anomaly (${Number(cols[latIdx]).toFixed(2)}°, ${Number(cols[lonIdx]).toFixed(2)}°)`,
            latitude: Number(cols[latIdx]),
            longitude: Number(cols[lonIdx]),
            brightness: brightIdx >= 0 ? `${cols[brightIdx]} K` : undefined,
            confidence: confIdx >= 0 ? cols[confIdx] : undefined,
            detectedAt: `${cols[dateIdx] || ''} ${cols[timeIdx] || ''} UTC`.trim(),
            satelliteOrSource: satIdx >= 0 ? `FIRMS ${cols[satIdx]}` : 'NASA FIRMS VIIRS',
            link: 'https://firms.modaps.eosdis.nasa.gov/map/',
            sourceLabel: 'NASA FIRMS API',
          };
        });
        if (items.length > 0) return { items };
      }
    }
  } catch {
    // Fall through to NASA EONET wildfire stream
  }

  // Official NASA EONET Active Wildfire Events fallback when FIRMS rejects standard api.nasa.gov key
  const eonetRes = await fetchWithTimeout('https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&limit=8&status=open');
  if (!eonetRes.ok) {
    throw new Error(`NASA EONET Wildfire API HTTP ${eonetRes.status}`);
  }
  const eonetData = await eonetRes.json();
  const events = Array.isArray(eonetData?.events) ? eonetData.events : [];
  const items: SpaceSearchResultItem[] = events.map((ev: any) => {
    const geom = ev.geometry?.[0];
    const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : [];
    return {
      kind: 'fire',
      id: `eonet-fire-${ev.id}`,
      toolId,
      title: ev.title || 'Active Wildfire Event',
      longitude: typeof coords[0] === 'number' ? Number(coords[0].toFixed(3)) : undefined,
      latitude: typeof coords[1] === 'number' ? Number(coords[1].toFixed(3)) : undefined,
      detectedAt: geom?.date || new Date().toISOString(),
      satelliteOrSource: ev.sources?.[0]?.id ? `NASA EONET (${ev.sources[0].id})` : 'NASA EONET Wildfires',
      link: ev.sources?.[0]?.url || ev.link,
      sourceLabel: 'NASA EONET Wildfires',
    };
  });

  return {
    items,
    notice: 'NASA FIRMS CSV endpoint requires a dedicated FIRMS MAP_KEY; showing live active wildfire detections from NASA EONET v3.',
  };
}

async function runDonkiTool(toolId: 'get_solar_flares' | 'get_cmes' | 'get_geomagnetic_storms', query: string, apiKey: string): Promise<{ items: SpaceSearchResultItem[]; notice?: string }> {
  const endpointMap = {
    get_solar_flares: 'FLR',
    get_cmes: 'CME',
    get_geomagnetic_storms: 'GST',
  } as const;

  const endpoint = endpointMap[toolId];
  const explicitDate = extractDateFromQuery(query);
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 45 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const defaultEnd = now.toISOString().split('T')[0];

  const params = new URLSearchParams({
    startDate: explicitDate || defaultStart,
    endDate: defaultEnd,
    api_key: apiKey,
  });

  const res = await fetchWithTimeout(`https://api.nasa.gov/DONKI/${endpoint}?${params.toString()}`);

  if (toolId === 'get_solar_flares' && !res.ok) {
    // NASA's gateway /DONKI/FLR intermittently returns 404; query official /DONKI/notifications?type=FLR
    const notifParams = new URLSearchParams({
      type: 'FLR',
      startDate: explicitDate || defaultStart,
      endDate: defaultEnd,
      api_key: apiKey,
    });
    const notifRes = await fetchWithTimeout(`https://api.nasa.gov/DONKI/notifications?${notifParams.toString()}`);
    if (notifRes.ok) {
      const notifData = await notifRes.json();
      const arr = Array.isArray(notifData) ? notifData.slice(-6).reverse() : [];
      return {
        items: arr.map((n: any) => {
          const body = String(n.messageBody || '');
          const classMatch = body.match(/\b([XMCB]\d+(?:\.\d+)?)\b/);
          const summaryLine = body
            .split('\n')
            .map((l: string) => l.replace(/^#+\s*/, '').trim())
            .filter((l: string) => l && !l.startsWith('Community Coordinated') && !l.startsWith('Disclaimer') && !l.startsWith('Message '))
            .slice(0, 2)
            .join(' · ');

          return {
            kind: 'flare',
            id: `flr-notif-${n.messageID || n.messageIssueTime}`,
            toolId,
            eventId: n.messageID || 'FLR-ALERT',
            classType: classMatch ? classMatch[1] : 'Solar Flare Alert',
            beginTime: n.messageIssueTime || '',
            instruments: ['NASA CCMC DONKI'],
            note: summaryLine || 'Solar flare notification issued by NASA CCMC DONKI.',
            link: n.messageURL,
            sourceLabel: 'NASA DONKI Notifications (FLR)',
          };
        }),
        notice: 'NASA /DONKI/FLR endpoint returned upstream 404; showing live solar flare notifications from NASA /DONKI/notifications?type=FLR.',
      };
    }
  }

  if (!res.ok) {
    throw new Error(`NASA DONKI ${endpoint} returned HTTP ${res.status}.`);
  }

  const data = await res.json();
  const arr = Array.isArray(data) ? data.slice(-6).reverse() : [];

  if (toolId === 'get_solar_flares') {
    return {
      items: arr.map((f: any) => ({
        kind: 'flare',
        id: `flr-${f.flrID || f.beginTime}`,
        toolId,
        eventId: f.flrID || 'FLR-EVENT',
        classType: f.classType || 'Observed Flare',
        beginTime: f.beginTime || f.peakTime || '',
        peakTime: f.peakTime,
        endTime: f.endTime,
        sourceLocation: f.sourceLocation || undefined,
        activeRegionNum: typeof f.activeRegionNum === 'number' ? f.activeRegionNum : undefined,
        instruments: Array.isArray(f.instruments) ? f.instruments.map((i: any) => i.displayName).filter(Boolean) : [],
        note: f.note || undefined,
        link: f.link,
        sourceLabel: 'NASA DONKI /FLR',
      })),
    };
  }

  if (toolId === 'get_cmes') {
    return {
      items: arr.map((c: any) => {
        const analysis = c.cmeAnalyses?.[0];
        return {
          kind: 'cme',
          id: `cme-${c.activityID || c.startTime}`,
          toolId,
          eventId: c.activityID || 'CME-EVENT',
          startTime: c.startTime || '',
          sourceLocation: c.sourceLocation || undefined,
          speedKms: typeof analysis?.speed === 'number' ? analysis.speed : undefined,
          halfAngle: typeof analysis?.halfAngle === 'number' ? analysis.halfAngle : undefined,
          cmeType: analysis?.type || undefined,
          isEarthFacing: typeof analysis?.isEarthFacing === 'boolean' ? analysis.isEarthFacing : undefined,
          instruments: Array.isArray(c.instruments) ? c.instruments.map((i: any) => i.displayName).filter(Boolean) : [],
          note: c.note || undefined,
          link: c.link,
          sourceLabel: 'NASA DONKI /CME',
        };
      }),
    };
  }

  return {
    items: arr.map((g: any) => {
      const kpEntry = Array.isArray(g.allKpIndex) ? g.allKpIndex[0] : undefined;
      return {
        kind: 'geomagnetic_storm',
        id: `gst-${g.gstID || g.startTime}`,
        toolId,
        eventId: g.gstID || 'GST-EVENT',
        startTime: g.startTime || '',
        kpIndex: typeof kpEntry?.kpIndex === 'number' ? kpEntry.kpIndex : undefined,
        observedTime: kpEntry?.observedTime,
        note: g.note || undefined,
        link: g.link,
        sourceLabel: 'NASA DONKI /GST',
      };
    }),
  };
}

async function runClimateTool(query: string): Promise<{ items: SpaceSearchResultItem[]; notice?: string }> {
  const items: SpaceSearchResultItem[] = [];
  try {
    const res = await fetchWithTimeout('https://climate.nasa.gov/', 5000);
    if (res.ok) {
      const html = await res.text();
      const meta = extractHtmlMeta(html);
      items.push({
        kind: 'climate',
        id: `climate-portal-${Date.now()}`,
        toolId: 'get_climate_indicator',
        title: meta.title || 'NASA Global Climate Change — Vital Signs of the Planet',
        subtitle: 'Earth Climate Monitoring Portal',
        summary: meta.description || 'Official NASA portal tracking global temperature anomalies, sea level rise, Arctic sea ice extent, and atmospheric CO2 levels.',
        highlights: [
          'Tracks GISTEMP surface temperature anomalies, ocean heat content, and global mean sea level',
          'Satellite carbon cycle monitoring via OCO-2 and GRACE-FO ice mass telemetry',
        ],
        dateOrMission: 'NASA Earth Science Division',
        link: 'https://climate.nasa.gov/',
        sourceLabel: 'climate.nasa.gov',
      });
    }
  } catch {
    // Provide clean portal reference without raw HTML error
    items.push({
      kind: 'climate',
      id: `climate-ref-${Date.now()}`,
      toolId: 'get_climate_indicator',
      title: 'NASA Global Climate Change Indicators',
      subtitle: 'GISTEMP · Sea Level · Carbon Cycle',
      summary: 'NASA Earth Science monitoring portal for global temperature anomalies, carbon dioxide concentration, and ice sheet mass.',
      dateOrMission: 'NASA Earth Science',
      link: 'https://climate.nasa.gov/',
      sourceLabel: 'climate.nasa.gov',
    });
  }

  // Also query NTRS for specific climate indicator keyword reports
  try {
    const ntrsRes = await fetchWithTimeout(`https://ntrs.nasa.gov/api/citations/search?q=${encodeURIComponent(query)}&page.size=2`, 4500);
    if (ntrsRes.ok) {
      const ntrsJson = await ntrsRes.json();
      const hits = Array.isArray(ntrsJson?.results) ? ntrsJson.results : [];
      hits.forEach((doc: any) => {
        items.push({
          kind: 'climate',
          id: `ntrs-climate-${doc.id}`,
          toolId: 'get_climate_indicator',
          title: doc.title || 'NASA Climate Technical Citation',
          subtitle: doc.center?.name || 'NASA NTRS Climate Record',
          summary: (doc.abstract || doc.description || 'Technical citation from NASA Technical Reports Server.').slice(0, 260),
          dateOrMission: doc.publishedDate ? doc.publishedDate.split('T')[0] : 'NASA NTRS',
          link: `https://ntrs.nasa.gov/citations/${doc.id}`,
          sourceLabel: 'NASA NTRS',
        });
      });
    }
  } catch {
    // Optional enrichment failed silently
  }

  return { items };
}

async function runBioExperimentsTool(query: string): Promise<{ items: SpaceSearchResultItem[]; notice?: string }> {
  const items: SpaceSearchResultItem[] = [];

  // 1. Live fetch NASA Biological & Physical Sciences portal metadata
  try {
    const res = await fetchWithTimeout('https://science.nasa.gov/biological-physical/', 5000);
    if (res.ok) {
      const html = await res.text();
      const meta = extractHtmlMeta(html);
      if (meta.title || meta.description) {
        items.push({
          kind: 'bio',
          id: `bps-portal-${Date.now()}`,
          toolId: 'search_bio_experiments',
          title: meta.title || 'NASA Biological & Physical Sciences Division',
          subtitle: 'ISS & Deep Space Life Sciences Portal',
          summary: meta.description || 'Research on microgravity gene expression, plant biology, and physical sciences aboard the International Space Station.',
          dateOrMission: 'NASA BPS / ISS',
          link: 'https://science.nasa.gov/biological-physical/',
          sourceLabel: 'science.nasa.gov',
        });
      }
    }
  } catch {
    // Non-fatal; OSDR studies still cover the query
  }

  // 2. Match against ASTRA's verified NASA OSDR Biological Research Repository
  const osdrMatches = await searchNasaResearchRAG(query, 4);
  osdrMatches.forEach((study) => {
    items.push({
      kind: 'bio',
      id: `osdr-search-${study.accession}`,
      toolId: 'search_bio_experiments',
      title: `${study.accession}: ${study.title}`,
      subtitle: `${study.topic}${study.species ? ` · ${study.species}` : ''}`,
      summary: study.summary,
      highlights: study.keyFindings?.slice(0, 2),
      dateOrMission: study.missionOrPayload || 'NASA OSDR',
      link: study.publicationUrl || `https://osdr.nasa.gov/bio/repo/data/studies/${study.accession}`,
      sourceLabel: 'NASA OSDR',
    });
  });

  return { items };
}

export async function executeSpaceDataSearch(rawQuery: string): Promise<SpaceSearchResponse> {
  const query = rawQuery.trim();
  const apiKey = getNasaApiKey();
  const detectedTools = classifySpaceSearchIntent(query);

  const runners = detectedTools.map(async (tool) => {
    switch (tool) {
      case 'get_apod':
      case 'search_apod_archive':
        return runApodTool(tool, query, apiKey);
      case 'get_asteroids_this_week':
      case 'find_closest_asteroids':
      case 'check_asteroid_hazard':
        return runAsteroidTool(tool, query, apiKey);
      case 'get_active_fires':
      case 'query_fire_hotspots':
        return runFiresTool(tool, apiKey);
      case 'get_solar_flares':
      case 'get_cmes':
      case 'get_geomagnetic_storms':
        return runDonkiTool(tool, query, apiKey);
      case 'get_climate_indicator':
        return runClimateTool(query);
      case 'search_bio_experiments':
        return runBioExperimentsTool(query);
    }
  });

  const settled = await Promise.allSettled(runners);
  const items: SpaceSearchResultItem[] = [];
  const notices: string[] = [];

  settled.forEach((result) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      if (result.value.notice) notices.push(result.value.notice);
    } else {
      notices.push(redactSecrets(result.reason?.message || 'Upstream NASA tool query timed out.').slice(0, 180));
    }
  });

  return {
    query,
    detectedTools,
    fetchedAt: new Date().toISOString(),
    items,
    notice: notices.length > 0 ? notices.join(' ') : undefined,
  };
}
