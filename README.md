# Vyas Inventory Tool

Construction material inventory, site consumption tracking and vendor procurement platform.

- **Frontend:** React 19 + Vite + Tailwind CSS
- **Backend:** Express (serves the API and the built frontend from one process)
- **Database:** MongoDB (all application data)
- **Integrations:** Gemini AI (assistant, market benchmarks, rate predictions), Resend (email)

## Vendor quotations (RFQ)

When a PR / order query is raised, every invited vendor is emailed a personal, secret link
(`/vendor-quote?pr=…&v=…&t=…`). The vendor opens it (no login), sees the requirement and submits or revises
their quotation. Quotes are stored directly in the MongoDB `vendor_quotations` collection and appear in the
Vendor Enquiry & Quote Comparison screen automatically (it refreshes every 15 seconds). A vendor's link can also
be copied from the "Add Vendor Quote" dialog. Links stop accepting quotes once the PR is awarded or closed.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | No | Database name (default `vyas_inventory`) |
| `PORT` | No | HTTP port (default `3000`) |
| `GEMINI_API_KEY` | No | Enables live AI features; built-in fallbacks are used without it |
| `RESEND_API_KEY` | For email | Resend API key |
| `EMAIL_FROM` | For email | Sender, e.g. `Vyas Procurement <noreply@yourdomain.com>`. The domain must be verified in Resend; without it Resend only delivers to the Resend account owner |
| `NOTIFICATION_EMAIL` | No | Internal inbox for notifications that have no specific recipient |

On first start against an empty database the app seeds MongoDB with the initial dataset. Any data a browser had saved
locally under the previous local-only version is migrated into MongoDB on that first load.

## Run locally

Prerequisite: Node.js 20+

```bash
npm install
npm run dev        # http://localhost:3000
```

## Production

```bash
npm install
npm run build      # builds the frontend to dist/ and the server to build/server.cjs
npm start          # runs in production mode
```

Health check: `GET /api/health` returns `200` when the database is reachable.

### Docker

```bash
docker build -t vyas-inventory-tool .
docker run -p 3000:3000 --env-file .env vyas-inventory-tool
```

### Hosting platforms (Render, Railway, a VPS, etc.)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Set the environment variables above in the platform's settings.
- In MongoDB Atlas, allow the host's outbound IP under **Network Access**.
