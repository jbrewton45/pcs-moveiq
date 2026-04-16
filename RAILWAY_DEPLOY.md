# PCS MoveIQ — Railway Deployment Runbook

This deploys the Express/TypeScript backend + PostgreSQL + a persistent volume for user-uploaded photos to Railway, and rebuilds the Capacitor iOS client against the HTTPS endpoint so login works from an iPhone on any network.

---

## 1. Prerequisites

- Railway account with a paid plan (free plan does not support persistent volumes).
- `railway` CLI installed: `brew install railway` (optional — all steps also available via the web UI).
- Mac with Xcode and the existing local iOS workspace.

---

## 2. Provision services in Railway

### 2a. Create the project

UI: **railway.app → New Project → Empty Project → name it `pcs-moveiq`.**
CLI:
```bash
cd /Volumes/Clear_NVMe/dev/projects/PCS_MoveIQ
railway login
railway init --name pcs-moveiq
```

### 2b. Add the PostgreSQL service

UI: inside the project dashboard → **+ New → Database → PostgreSQL**. Railway will auto-inject `DATABASE_URL` into other services in the same project.
CLI:
```bash
railway add --database postgres
```

### 2c. Add the backend service

UI: **+ New → GitHub Repo** (connect GitHub and pick this repo) **or + New → Empty Service** if you'll deploy via `railway up` from your Mac.

Settings on the new service:
- **Root Directory**: leave at repo root (`/`).
- **Watch Paths** (optional): `server/**`, `railway.json`.
- **Builder**: Nixpacks (auto-detected from `railway.json`).
- **Start Command**: comes from `railway.json` → `node server/dist/index.js`.
- **Healthcheck Path**: `/api/health-root` (also from `railway.json`).

### 2d. Attach a volume for uploaded photos

UI: on the backend service → **Settings → Volumes → + New Volume**.
- **Mount Path**: `/data`
- **Size**: 5 GB (adjust later as needed).

CLI:
```bash
railway volume add --mount-path /data --service pcs-moveiq
```

### 2e. Set environment variables on the backend service

UI: backend service → **Variables** tab → add each. CLI equivalent shown.

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | *(leave blank)* | Railway auto-injects |
| `DATABASE_URL` | *(auto-linked)* | Click **Add Reference → Postgres.DATABASE_URL** |
| `JWT_SECRET` | `$(openssl rand -hex 32)` output | Random 64-char hex |
| `UPLOADS_DIR` | `/data/uploads` | Must match volume mount path |
| `ANTHROPIC_API_KEY` | *(your key)* | Optional — AI identification |
| `OPENAI_API_KEY` | *(your key)* | Optional — fallback |
| `EBAY_APP_ID` | *(your id)* | Optional — comparables |
| `EBAY_CERT_ID` | *(your cert)* | Optional |
| `EBAY_MARKETPLACE_ID` | `EBAY_US` | Optional |

CLI:
```bash
railway variables set \
  NODE_ENV=production \
  JWT_SECRET=$(openssl rand -hex 32) \
  UPLOADS_DIR=/data/uploads
# DATABASE_URL is auto-linked when you added Postgres in the same project
```

### 2f. Generate a public HTTPS domain

UI: backend service → **Settings → Networking → Generate Domain**. Railway returns something like `pcs-moveiq-production.up.railway.app`. Note it — you need it for the iOS build.

CLI:
```bash
railway domain
# prints e.g. https://pcs-moveiq-production.up.railway.app
```

### 2g. Deploy

UI: push to the connected GitHub branch → Railway auto-builds.
CLI:
```bash
railway up
```

Watch the build log. Successful boot log should contain:
```
PCS MoveIQ server running on http://0.0.0.0:<PORT>
```

---

## 3. Verify the backend from the Mac

Replace `<DOMAIN>` with the value from step 2f.

```bash
# Public health check
curl -sS -i https://<DOMAIN>/api/health-root
#   expect 200 + {"ok":true,"message":"PCS MoveIQ API is running"}

# Signup (round-trip Postgres)
curl -sS -X POST https://<DOMAIN>/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"hunter222","displayName":"Test"}'
#   expect 200 + {"user":{...},"token":"eyJ..."}

# Follow-up authenticated call
TOKEN=<paste-token-from-previous-response>
curl -sS https://<DOMAIN>/api/auth/me -H "Authorization: Bearer $TOKEN"
#   expect 200 + the user object
```

If any of these fail, inspect Railway → backend service → **Logs**.

---

## 4. Rebuild iOS client against the Railway HTTPS endpoint

```bash
cd /Volumes/Clear_NVMe/dev/projects/PCS_MoveIQ/client

# Bake the Railway HTTPS origin into the production bundle
VITE_API_ORIGIN=https://<DOMAIN> npm run build

# Copy the fresh bundle into ios/App/App/public
npx cap sync ios

# Open Xcode and run on your device
open ios/App/App.xcworkspace
```

In Xcode: **Product → Clean Build Folder** (Shift+Cmd+K), then **Run** on the connected iPhone.

Because the origin is HTTPS, the Info.plist ATS dev exception (`NSAllowsArbitraryLoads=true`) is no longer required for Railway traffic. Keep it for now to retain the ability to hit a local dev server on `http://<LAN-IP>:4000`; remove it before App Store submission.

---

## 5. End-to-end verification on the phone

1. Launch app → Login screen appears.
2. Sign up a fresh user or log in with the account created in step 3.
3. Xcode Console (or Safari → Develop → iPhone → PCS MoveIQ → Console) shows:
   ```
   [api] → POST https://<DOMAIN>/api/auth/login { body: '{"email":"…","password":"…"}' }
   [api] ← 200 OK https://<DOMAIN>/api/auth/login
   ```
4. Create a project + a room + an item; attach a photo. The photo thumbnail loads via `https://<DOMAIN>/uploads/<filename>`.
5. In Railway → backend service → **Shell** (or `railway shell`), run:
   ```bash
   ls /data/uploads
   ```
   The uploaded file is listed.

---

## 6. Persistence smoke test (survives redeploy)

1. Note the uploaded photo filename from step 5.
2. In Railway, trigger a redeploy (push a no-op commit, or **Deployments → ⋯ → Redeploy**).
3. After the new instance is live, reopen the iOS app.
4. Confirm:
   - User can log in (Postgres row survived).
   - The previously created item still exists (Postgres row survived).
   - The photo thumbnail still renders (volume file survived).

If any of the three fail, the volume or DB was not correctly attached — re-check step 2b/2d.

---

## 7. Rollback / dev fallback

- **Local dev against Railway Postgres**: set `DATABASE_URL` in `server/.env` to the Postgres "Public Network" URL Railway provides, leave `UPLOADS_DIR` unset so uploads write to `./server/uploads`.
- **Fully offline dev**: unset `DATABASE_URL`, stand up a local Postgres, unset `UPLOADS_DIR`. Start the server with `PORT=4000 npm run dev` (avoids macOS AirPlay Receiver on :5000) — this is still the normal dev workflow.
