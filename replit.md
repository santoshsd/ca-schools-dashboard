# California School Dashboard - Developer Platform

## Overview
A developer platform that exposes California K-12 education data through RESTful APIs. Built on data from the California School Dashboard (caschooldashboard.org).

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit Auth (OpenID Connect) on Replit, email/password on Azure
- **Deployment**: Azure App Service (container) + Azure Database for PostgreSQL Flexible Server

## Key Features
1. RESTful API (v1) with API key authentication
2. Developer portal with documentation, API explorer
3. API key management and usage metering
4. Real CDE data: 58 counties, 1,443 districts, 10,587 schools, 373,929 performance records
5. Data ingestion from CDE public data files (graduation rate, suspension rate)
6. Weekly monitoring agent checks CDE data sources for updates
7. Health check endpoint at `/api/health`

## Data Model
- **Counties** → **Districts** → **Schools** (hierarchical)
- **Indicators**: ELA, Math, ELPI, Graduation Rate, Chronic Absenteeism, Suspension Rate, College/Career Readiness
- **Student Groups**: All Students, race/ethnicity groups, program groups (EL, SWD, SED, Foster, Homeless)
- **Performance Data**: Metrics linking schools/districts/counties to indicators and student groups by academic year

## API Endpoints (require API key)
- `GET /api/v1/counties` - List counties
- `GET /api/v1/districts` - List districts (filter by county)
- `GET /api/v1/schools` - Search/filter schools
- `GET /api/v1/indicators` - List indicator types
- `GET /api/v1/student-groups` - List student groups
- `GET /api/v1/performance` - Query performance data
- `GET /api/v1/overview` - Platform statistics
- `GET /api/health` - Health check (no auth required)

## Internal Endpoints (require session auth)
- `POST /api/keys` - Create API key
- `GET /api/keys` - List user's API keys
- `DELETE /api/keys/:id` - Deactivate key
- `GET /api/usage` - Usage statistics

## Auth Endpoints (standalone mode, non-Replit)
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/user` - Current user
- `GET /api/logout` - Sign out

## Frontend Pages
- `/` - Landing page (unauthenticated) / Dashboard (authenticated)
- `/dashboard` - API key management + usage
- `/docs` - API documentation
- `/explorer` - Interactive API testing
- `/auth` - Login/registration page (standalone mode)

## File Structure
- `shared/schema.ts` - All Drizzle schemas and types
- `server/routes.ts` - API routes
- `server/storage.ts` - Database storage layer
- `server/seed.ts` - Fallback seed data (not used when real CDE data is present)
- `server/ingest-cde-data.ts` - Real CDE data ingestion script
- `server/ingestion-agent.ts` - Weekly CDE data source monitoring agent
- `server/auth-adapter.ts` - Auth adapter (Replit vs standalone)
- `client/src/pages/` - React pages (landing, dashboard, docs, explorer, auth)

## Azure Deployment
- **Target**: Azure App Service (Linux, Node.js 20) + Azure Database for PostgreSQL Flexible Server
- **Custom Domain**: cadashboard.s13i.me
- **Estimated Cost**: ~$26/month (B1 App Service + B1ms PostgreSQL)

### Deployment Options (no local installs needed)
1. **Azure Cloud Shell** (recommended): `bash azure/cloud-shell-deploy.sh` — runs in browser
2. **Azure Portal UI**: Follow step-by-step guide in `azure/PORTAL-DEPLOY-GUIDE.md`
3. **Docker container**: Use `Dockerfile` + `azure/main.bicep` + `azure/deploy.sh`
4. **GitHub Actions CI/CD**: `.github/workflows/deploy-azure.yml` for automatic deploys

### Azure Infrastructure Files
- `azure/main-nodejs.bicep` - Bicep template for Node.js App Service (no Docker)
- `azure/main.bicep` - Bicep template for Docker container deployment
- `azure/cloud-shell-deploy.sh` - One-command deploy via Azure Cloud Shell
- `azure/deploy.sh` - Deploy script for Docker-based deployment
- `azure/PORTAL-DEPLOY-GUIDE.md` - Full portal walkthrough guide

### Azure Environment Variables
- `DATABASE_URL` - PostgreSQL connection string with `?sslmode=require`
- `SESSION_SECRET` - Express session secret
- `PORT` - App port (8080 for Azure)
- `NODE_ENV` - Set to `production`
