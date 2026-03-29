# PCS MoveIQ

A mobile-ready web app for military families managing PCS (Permanent Change of Station) moves. Uses AI (Anthropic Claude) to identify items from photos and provide resale pricing estimates.

## Architecture

- **Frontend**: React 19 + Vite, built to `client/dist/`, served by Express
- **Backend**: Node.js + Express 5 (TypeScript), runs on port 5000
- **Database**: Replit PostgreSQL (via `pg` library, DATABASE_URL env var)
- **Auth**: JWT + bcryptjs
- **AI**: Anthropic Claude (primary) + OpenAI (fallback) for item identification and pricing

## Key Files

| File | Purpose |
|------|---------|
| `server/src/index.ts` | Server entry point — initializes DB schema, starts Express |
| `server/src/data/database.ts` | PostgreSQL pool + `query()` helper + `initializeSchema()` |
| `server/src/services/` | All business logic (async, PostgreSQL) |
| `server/src/controllers/` | HTTP handlers (all async) |
| `server/src/middleware/auth.middleware.ts` | JWT authentication middleware |
| `start.sh` | Development: builds client, installs deps, runs server |
| `build.sh` | Deployment build: compiles TypeScript + builds React client |
| `run.sh` | Deployment run: `PORT=${PORT:-5000} node server/dist/index.js` |

## Development

The workflow `Start application` runs `bash start.sh` which:
1. Installs client dependencies and builds the React app
2. Installs server dependencies
3. Compiles TypeScript and starts Express

## Deployment

- Target: **autoscale** (configured in `.replit`)
- Build: `bash build.sh`
- Run: `bash run.sh`
- Port: 5000 (maps to external port 80)
- Database: Replit PostgreSQL — persists across deployments

## Important Notes

- Server must bind to `0.0.0.0` (not localhost) — already configured
- Server uses `process.env.PORT || 5000` — respects platform-set PORT
- Database schema is auto-created on startup via `initializeSchema()` in database.ts
- All service functions are async (PostgreSQL is async, unlike the previous SQLite setup)
- Express 5 handles async route errors automatically — no try-catch wrappers needed in routes

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (set by Replit)
- `JWT_SECRET` — JWT signing key (set as secret)
- `ANTHROPIC_API_KEY` — Claude API key (optional, set as secret)
- `OPENAI_API_KEY` — OpenAI API key (optional fallback, set as secret)
- `EBAY_APP_ID` — eBay Browse API key (optional, for comparable pricing)
