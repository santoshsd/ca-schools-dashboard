# Deploy to Railway

Railway deploys directly from your GitHub repository using the included Dockerfile.

---

## Prerequisites

- [Railway account](https://railway.app) (Hobby plan: $5/month with $5 credit)
- GitHub repository connected to Railway

## Quick Start

### 1. Create a New Project

1. Go to [railway.app/new](https://railway.app/new)
2. Select **Deploy from GitHub repo**
3. Choose `santoshsd/ca-schools-dashboard`
4. Railway auto-detects the `Dockerfile` and begins building

### 2. Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**
2. Railway provisions a managed PostgreSQL 16 instance
3. The `DATABASE_URL` is automatically available as a service variable

### 3. Link the Database to Your App

1. Click your app service → **Variables**
2. Add a reference variable:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`
3. Add these additional variables:

   | Name | Value |
   |------|-------|
   | `SESSION_SECRET` | Run `openssl rand -hex 32` and paste the result |
   | `NODE_ENV` | `production` |
   | `PORT` | `8080` |

4. Railway redeploys automatically when variables change

### 4. Run Database Migrations

Using the [Railway CLI](https://docs.railway.app/guides/cli):

```bash
npm install -g @railway/cli
railway login
railway link  # select your project
railway run npx drizzle-kit push
```

Or run migrations from your local machine with the `DATABASE_URL` from Railway:

```bash
DATABASE_URL="postgresql://..." npx drizzle-kit push
```

### 5. Verify Deployment

```bash
# Health check
curl https://YOUR_APP.up.railway.app/api/healthz

# Should return: {"status":"ok"}
```

---

## Custom Domain

1. In Railway, click your service → **Settings** → **Networking** → **Custom Domain**
2. Enter your domain (e.g., `caschooldatahub.s13i.me`)
3. Add the CNAME record at your DNS provider:
   - **Name:** `caschooldatahub` (or your subdomain)
   - **Value:** The target Railway provides (e.g., `your-app.up.railway.app`)
4. Railway provisions a TLS certificate automatically

---

## CI/CD via GitHub Actions

The included `.github/workflows/deploy.yml` automates deployment on push to `main`:

1. **Typecheck** — runs `npm run check`
2. **Deploy** — uses Railway CLI to deploy
3. **Migrate** — runs `npx drizzle-kit push`
4. **Health check** — verifies the app is responding

### Required GitHub Secrets

| Secret | Where to find it |
|--------|-----------------|
| `RAILWAY_TOKEN` | [railway.app](https://railway.app) → Account → Tokens → Create Token |
| `DATABASE_URL` | Railway project → PostgreSQL service → Variables → `DATABASE_URL` |

### Optional GitHub Variables

| Variable | Purpose |
|----------|---------|
| `RAILWAY_PUBLIC_URL` | Your app's public URL (for health checks), e.g. `https://your-app.up.railway.app` |

---

## Local Development

Use Docker Compose for a local environment matching production:

```bash
docker compose up
```

This starts PostgreSQL 16 and the app on `http://localhost:8080`.

Or run without Docker:

```bash
cp .env.example .env  # edit DATABASE_URL for your local Postgres
npm install
npm run dev
```

---

## Data Ingestion

After deployment, trigger CDE data ingestion:

```bash
# Via Railway CLI
railway run npx tsx server/ingest-cde-data.ts

# Or with DATABASE_URL directly
DATABASE_URL="postgresql://..." npx tsx server/ingest-cde-data.ts
```

Verify expected data volumes:
- ~58 counties
- ~1,000+ districts  
- ~10,000+ schools

---

## Estimated Cost

| Resource | Plan | Approx. Cost |
|----------|------|-------------|
| Railway App Service | Hobby | ~$5/month |
| Railway PostgreSQL | Hobby | Included (up to 1 GB) |
| **Total** | | **~$5/month** |

For higher traffic, upgrade to the Pro plan ($20/month) for more resources and team features.
