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
  const app = await appPromise;
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
