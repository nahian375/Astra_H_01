import serverless from 'serverless-http';
import { createApiApp } from '../../server/apiRouter.ts';

const apiApp = createApiApp();
const serverlessHandler = serverless(apiApp, {
  binary: ['application/wasm', 'application/octet-stream', 'image/*', 'application/pdf'],
});

export const handler = async (event: any, context: any) => {
  if (event && typeof event.path === 'string' && event.path.startsWith('/.netlify/functions/api')) {
    const suffix = event.path.slice('/.netlify/functions/api'.length);
    event.path = `/api${suffix.startsWith('/') ? suffix : suffix ? `/${suffix}` : ''}`;
  }
  return serverlessHandler(event, context);
};
