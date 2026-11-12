/**
 * ASTRA Health - Mission Server
 * Ensures environment variables are validated prior to initialization.
 * Prevents silent startup failures by logging detailed diagnostics and catching binding errors.
 */

import express from 'express';
import path from 'path';
import fs from 'node:fs';
import { loadAndVerifyEnv } from './server/env.ts';
import { createApiApp } from './server/apiRouter.ts';
import { issueAppSessionCookieIfEligible } from './server/security.ts';

// 1. Validate & load environment variables prior to any server initialization
const envConfig = loadAndVerifyEnv();

// Catch unexpected crashes early to prevent silent process termination
process.on('uncaughtException', (err) => {
  console.error('[ASTRA Health] FATAL: Uncaught Exception during runtime:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ASTRA Health] FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  const app = express();

  // Security hardening: Prevent Express fingerprinting and apply baseline security headers
  app.disable('x-powered-by');
  const isProdMode = process.env.NODE_ENV === 'production';
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://huggingface.co https://*.hf.co https://cdn.jsdelivr.net https://unpkg.com blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', cspHeader);
    if (isProdMode && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Mount API endpoints
  app.use(createApiApp());

  // Issue HttpOnly signed session cookie when serving the browser app shell
  app.use(issueAppSessionCookieIfEligible);

  // Explicit static route for ONNX Runtime WASM assets to guarantee application/wasm headers
  const publicWasmPath = path.join(process.cwd(), 'public', 'wasm');
  if (fs.existsSync(publicWasmPath)) {
    app.use('/wasm', express.static(publicWasmPath, {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filepath.endsWith('.mjs') || filepath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
  }

  // Environment mode handling: In production with a built dist, serve static files.
  // In development (or live preview), reliably mount Vite middleware for instant zero-config rendering.
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (isProd && hasDist) {
    console.log(`[ASTRA Health] Serving compiled production client from: ${distPath}`);
    app.use(express.static(distPath, {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (filepath.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get('*', (req, res, next) => {
      // Return 404 for missing static assets rather than index.html
      if (/\.(wasm|mjs|js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|map)$/i.test(req.path)) {
        return res.status(404).send('Asset not found');
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[ASTRA Health] Initializing Vite middleware for development preview...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: ['.run.app', 'localhost', '127.0.0.1'],
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // SPA fallback: transform and serve index.html for all non-API GET navigation requests
    app.use('*', async (req, res, next) => {
      if (req.method !== 'GET') return next();
      const url = req.originalUrl;
      // Do not serve index.html for asset requests (files with extensions) to prevent WebAssembly compile errors
      if (/\.(wasm|mjs|js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|map)$/i.test(url.split('?')[0])) {
        return res.status(404).send('Asset not found');
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  const PORT = envConfig.port;
  const fallbackPort = 5000;
  let listeningPort = PORT;

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ASTRA Health] Mission Server active at http://localhost:${listeningPort}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && !process.env.PORT && listeningPort !== fallbackPort) {
      listeningPort = fallbackPort;
      console.warn(`[ASTRA Health] Port ${PORT} is already in use; retrying on ${fallbackPort}.`);
      server.listen(fallbackPort, '0.0.0.0');
      return;
    }

    console.error(`[ASTRA Health] Server listener error on port ${listeningPort}:`, err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('[ASTRA Health] FATAL: Server initialization failure:', err);
  process.exit(1);
});
