import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Redacts potential API keys, bearer tokens, or query secrets from log/error text.
 */
export function redactSecrets(input: unknown): string {
  const text = typeof input === 'string' ? input : (input instanceof Error ? input.message : String(input ?? ''));
  return text
    .replace(/(api_key|apikey|key|token|secret)=([^&\s]+)/gi, '$1=[REDACTED]')
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
}

/**
 * Wraps a promise with a strict timeout to prevent hung upstream requests.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Lightweight in-memory sliding-window rate limiter keyed by client IP.
 */
export function createRateLimiter(options: { windowMs: number; maxRequests: number; name: string }) {
  const hits = new Map<string, number[]>();
  const { windowMs, maxRequests, name } = options;

  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of hits.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        hits.delete(ip);
      } else {
        hits.set(ip, fresh);
      }
    }
  }, Math.max(windowMs, 60_000));
  if (typeof pruneInterval.unref === 'function') {
    pruneInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = (hits.get(clientIp) || []).filter((t) => t > cutoff);

    if (prev.length >= maxRequests) {
      const oldest = prev[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Rate limit exceeded for ${name}. Please wait ${retryAfterSec}s before retrying.`,
      });
    }

    prev.push(now);
    // Bound map cardinality against IP spoofing floods
    if (hits.size > 5000 && !hits.has(clientIp)) {
      const firstKey = hits.keys().next().value;
      if (firstKey) hits.delete(firstKey);
    }
    hits.set(clientIp, prev);
    next();
  };
}

const SESSION_COOKIE_NAME = 'astra_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// Cryptographic signing key: uses configured ASTRA_SESSION_SECRET or a process-unique CSPRNG key
const SESSION_SIGNING_KEY: Buffer =
  process.env.ASTRA_SESSION_SECRET && process.env.ASTRA_SESSION_SECRET.trim().length > 0
    ? crypto.createHash('sha256').update(process.env.ASTRA_SESSION_SECRET.trim()).digest()
    : crypto.randomBytes(32);

function isTrustedProxyPeer(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  const addr = remoteAddress.replace(/^::ffff:/i, '').toLowerCase();
  return (
    addr === '::1' ||
    addr === '127.0.0.1' ||
    addr.startsWith('10.') ||
    addr.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)
  );
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      const rawVal = part.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

function createSignedSessionToken(sub = 'astra-session'): string {
  const now = Date.now();
  const payload = {
    sid: crypto.randomUUID(),
    sub,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

function verifySignedSessionToken(token: string | null): { valid: boolean; sub?: string } {
  if (!token || typeof token !== 'string') return { valid: false };
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1 || token.indexOf('.', dotIdx + 1) !== -1) {
    return { valid: false };
  }
  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return { valid: false };

  const expectedSig = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payloadB64).digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return { valid: false };
  }
  if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || typeof decoded.exp !== 'number') {
      return { valid: false };
    }
    if (Date.now() >= decoded.exp) {
      return { valid: false };
    }
    return { valid: true, sub: typeof decoded.sub === 'string' ? decoded.sub : 'astra-session' };
  } catch {
    return { valid: false };
  }
}

function verifyBearerAuthToken(authHeader: string | undefined): boolean {
  const configuredToken = process.env.ASTRA_API_AUTH_TOKEN?.trim();
  if (!configuredToken || !authHeader || typeof authHeader !== 'string') return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return false;
  const supplied = match[1].trim();
  if (!supplied) return false;

  const expectedDigest = crypto.createHash('sha256').update(configuredToken).digest();
  const suppliedDigest = crypto.createHash('sha256').update(supplied).digest();
  return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
}

function getTrustedProxyUser(req: Request): string | null {
  if (process.env.ASTRA_TRUST_PROXY_AUTH !== 'true') return null;
  if (!isTrustedProxyPeer(req.socket?.remoteAddress)) return null;
  const iapEmail = req.headers['x-goog-authenticated-user-email'];
  const fwdUser = req.headers['x-forwarded-user'];
  const raw = Array.isArray(iapEmail) ? iapEmail[0] : (iapEmail || (Array.isArray(fwdUser) ? fwdUser[0] : fwdUser));
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().slice(0, 128);
  }
  return null;
}

export function verifyRequestAuth(req: Request): { authenticated: boolean; method?: string; subject?: string } {
  if (verifyBearerAuthToken(req.headers.authorization)) {
    return { authenticated: true, method: 'bearer-token', subject: 'api-client' };
  }
  const proxyUser = getTrustedProxyUser(req);
  if (proxyUser) {
    return { authenticated: true, method: 'trusted-proxy', subject: proxyUser };
  }
  const cookieToken = parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  const sessionCheck = verifySignedSessionToken(cookieToken);
  if (sessionCheck.valid) {
    return { authenticated: true, method: 'session-cookie', subject: sessionCheck.sub };
  }
  return { authenticated: false };
}

/**
 * Protects sensitive /api/* routes.
 * Requires either a valid server-signed HttpOnly session cookie, a configured Bearer token,
 * or a trusted reverse-proxy identity header. Rejects cross-site browser requests.
 */
export function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  const secFetchSite = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'].toLowerCase() : '';
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({ error: 'Cross-site request blocked by server security policy.' });
  }

  const auth = verifyRequestAuth(req);
  if (!auth.authenticated && process.env.ASTRA_REQUIRE_PROXY_AUTH === 'true') {
    return res.status(401).json({ error: 'Authentication required to access this ASTRA Health endpoint.' });
  }

  if (req.headers.origin) {
    return enforceSameOriginIfCrossOrigin(req, res, next);
  }

  return next();
}

/**
 * Issues a short-lived HttpOnly HMAC-SHA256 signed session cookie on HTML app shell requests.
 * When ASTRA_REQUIRE_PROXY_AUTH=true, refuses unauthenticated requests with 401.
 */
export function issueAppSessionCookieIfEligible(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/wasm/')) return next();
  if (/\.(wasm|mjs|js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|map|webmanifest)$/i.test(req.path)) {
    return next();
  }
  const acceptHeader = typeof req.headers.accept === 'string' ? req.headers.accept : '';
  if (req.path !== '/' && !acceptHeader.includes('text/html')) {
    return next();
  }

  const existingAuth = verifyRequestAuth(req);
  if (process.env.ASTRA_REQUIRE_PROXY_AUTH === 'true' && !existingAuth.authenticated) {
    return res.status(401).json({ error: 'Deployment authentication required.' });
  }

  const cookieToken = parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!verifySignedSessionToken(cookieToken).valid) {
    const signedToken = createSignedSessionToken(existingAuth.subject || 'astra-browser-session');
    const hostWithoutPort = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().split(':')[0].toLowerCase();
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || hostWithoutPort.endsWith('.run.app');
    const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
    const cookieAttrs = [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedToken)}`,
      'Path=/',
      `Max-Age=${maxAgeSec}`,
      'HttpOnly',
      isHttps ? 'SameSite=None' : 'SameSite=Strict',
      ...(isHttps ? ['Secure', 'Partitioned'] : []),
    ];
    res.setHeader('Set-Cookie', cookieAttrs.join('; '));
  }

  return next();
}

/**
 * Blocks cross-origin browser requests to mutating API routes when an Origin header
 * is supplied and does not match the server's Host header.
 * Only honors X-Forwarded-Host when the immediate TCP peer is a trusted loopback/private proxy.
 * Preserves same-origin browser calls and non-browser CLI/health calls cleanly.
 */
export function enforceSameOriginIfCrossOrigin(req: Request, res: Response, next: NextFunction) {
  const originHeader = req.headers.origin;
  if (!originHeader || typeof originHeader !== 'string') {
    return next();
  }

  const rawForwardedHost = isTrustedProxyPeer(req.socket?.remoteAddress)
    ? req.headers['x-forwarded-host']
    : undefined;
  const forwardedHost = Array.isArray(rawForwardedHost) ? rawForwardedHost[0] : rawForwardedHost;
  const firstForwardedHost = typeof forwardedHost === 'string' ? forwardedHost.split(',')[0].trim() : '';
  const directHost = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const expectedHost = firstForwardedHost || (typeof directHost === 'string' ? directHost.trim() : '');

  if (!expectedHost) {
    return res.status(403).json({ error: 'Cross-origin request rejected: missing host context.' });
  }

  try {
    const parsedOrigin = new URL(originHeader);
    if (parsedOrigin.host.toLowerCase() !== expectedHost.toLowerCase()) {
      return res.status(403).json({ error: 'Cross-origin request blocked by server origin policy.' });
    }
  } catch {
    return res.status(403).json({ error: 'Malformed Origin header.' });
  }

  return next();
}

/**
 * Sanitizes single-line or bounded prompt text inputs to strip control characters.
 */
export function sanitizePromptText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string' || maxLen <= 0) return '';
  return input
    .slice(0, maxLen * 4)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Strips prototype-pollution keys from untrusted JSON objects recursively.
 */
export function stripDangerousObjectKeys<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => stripDangerousObjectKeys(item, depth + 1)) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      continue;
    }
    clean[k] = stripDangerousObjectKeys(v, depth + 1);
  }
  return clean as T;
}

/**
 * Verifies decoded upload file bytes match the declared MIME type magic bytes.
 */
export function validateUploadMagicBytes(buf: Buffer, declaredMime: string): boolean {
  if (!buf || buf.length < 8) return false;
  const mime = declaredMime.toLowerCase();

  if (mime === 'application/pdf') {
    // Allow optional leading UTF-8 BOM or whitespace before %PDF-
    const head = buf.subarray(0, 32).toString('latin1');
    return head.includes('%PDF-');
  }

  if (mime === 'image/png') {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }

  if (mime === 'image/webp') {
    if (buf.length < 12) return false;
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
}

const PRIVATE_OR_LOCAL_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[(::1?|::ffff:(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|[0-9a-f:]+)|f[cd][0-9a-f]{2}:[^\]]+|fe80:[^\]]+)\]|.*\.local|.*\.internal)$/i;

const MODEL_PROXY_ALLOWED_SUFFIXES = [
  'huggingface.co',
  'hf.co',
  'cdn.jsdelivr.net',
];

/**
 * Validates that an external model proxy URL (or redirect target) is HTTPS,
 * has no embedded credentials or non-standard ports, is non-private/loopback,
 * and matches the HuggingFace / jsDelivr allowlist.
 */
export function isSafeHttpsModelUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Malformed URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS protocol is permitted' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URL credentials are not permitted' };
  }

  if (parsed.port && parsed.port !== '443') {
    return { ok: false, reason: 'Only standard HTTPS port 443 is permitted' };
  }

  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_OR_LOCAL_HOST_REGEX.test(host)) {
    return { ok: false, reason: 'Private or loopback host is not allowed' };
  }

  const isAllowed = MODEL_PROXY_ALLOWED_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!isAllowed) {
    return { ok: false, reason: `Host ${host} is not allowed` };
  }

  return { ok: true, url: parsed };
}

/**
 * Ensures env-configured external API base URLs remain strict HTTPS endpoints.
 */
export function safeHttpsBaseUrl(envValue: string | undefined, fallbackUrl: string): string {
  if (!envValue) return fallbackUrl;
  try {
    const parsed = new URL(envValue.trim());
    if (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      !PRIVATE_OR_LOCAL_HOST_REGEX.test(parsed.hostname)
    ) {
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // Fall back to verified official endpoint
  }
  return fallbackUrl;
}
