// Vercel serverless entry: every /api/* request is routed here (see vercel.json) and handled
// by the same Express app the standalone server uses. The React app itself is served from dist/.
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server.js';

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appPromise) {
    appPromise = createApp({ serveFrontend: false, scheduleJobs: false }).catch((err) => {
      appPromise = null; // retry on the next request
      throw err;
    });
  }
  let app: Awaited<ReturnType<typeof createApp>>;
  try {
    app = await appPromise;
  } catch (err: any) {
    // Never show start-up details to users: log them and answer with a plain message
    console.error('[API] Failed to start:', err?.stack || err?.message || err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'The service is temporarily unavailable. Please try again in a moment.' }));
    return;
  }
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
