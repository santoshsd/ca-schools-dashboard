# California School Dashboard - Developer Platform

## Overview
A developer platform that exposes California K-12 education data through RESTful APIs. Built on data from the California School Dashboard (caschooldashboard.org).

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit Auth (OpenID Connect)

## Key Features
1. RESTful API (v1) with API key authentication
2. Developer portal with documentation, API explorer
3. API key management and usage metering
4. Data ingestion monitoring agent (weekly checks)
5. Seed data for 16 counties, 20 districts, 20 schools, 7 indicators, 14 student groups

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

## Internal Endpoints (require Replit Auth)
- `POST /api/keys` - Create API key
- `GET /api/keys` - List user's API keys
- `DELETE /api/keys/:id` - Deactivate key
- `GET /api/usage` - Usage statistics

## Frontend Pages
- `/` - Landing page (unauthenticated) / Dashboard (authenticated)
- `/dashboard` - API key management + usage
- `/docs` - API documentation
- `/explorer` - Interactive API testing

## File Structure
- `shared/schema.ts` - All Drizzle schemas and types
- `server/routes.ts` - API routes
- `server/storage.ts` - Database storage layer
- `server/seed.ts` - Seed data
- `server/ingestion-agent.ts` - Data monitoring agent
- `client/src/pages/` - React pages (landing, dashboard, docs, explorer)
