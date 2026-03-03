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
4. Data ingestion monitoring agent (weekly checks)
5. Seed data for 16 counties, 20 districts, 20 schools, 7 indicators, 14 student groups
6. Health check endpoint at `/api/health`

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
- `server/seed.ts` - Seed data
- `server/ingestion-agent.ts` - Data monitoring agent
- `server/auth-adapter.ts` - Auth adapter (Replit vs standalone)
- `client/src/pages/` - React pages (landing, dashboard, docs, explorer, auth)

## Azure Deployment
- **Target**: Azure App Service (Linux container) + Azure Database for PostgreSQL Flexible Server
- **Custom Domain**: cadashboard.s13i.me
- **Docker**: Multi-stage build, production image runs `node dist/index.cjs` on port 8080
- **Infrastructure**: Azure Bicep templates in `azure/main.bicep`
- **CI/CD**: GitHub Actions workflow in `.github/workflows/deploy-azure.yml`
- **Deploy Script**: `azure/deploy.sh` for initial setup

### Azure Environment Variables
- `DATABASE_URL` - PostgreSQL connection string with `?sslmode=require`
- `SESSION_SECRET` - Express session secret
- `PORT` - App port (8080 for Azure)
- `NODE_ENV` - Set to `production`
- `WEBSITES_PORT` - Azure App Service port mapping (8080)

### Deploy Steps
1. `az group create` - Create resource group
2. `az deployment group create` - Deploy Bicep template
3. `docker build && docker push` - Build and push container to ACR
4. `npx drizzle-kit push` - Run database migrations
5. Configure custom domain CNAME and SSL
