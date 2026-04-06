#!/bin/bash
set -euo pipefail

echo "============================================="
echo " CA School Dashboard - Azure Cloud Shell Deploy"
echo "============================================="
echo ""
echo "This script runs entirely in Azure Cloud Shell."
echo "No local installs needed - just open Azure Portal"
echo "and click the Cloud Shell icon (>_) in the top bar."
echo ""

RESOURCE_GROUP="${RESOURCE_GROUP:-ca-school-dashboard-rg}"
LOCATION="${LOCATION:-westus2}"

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "Enter a strong password for the PostgreSQL database:"
  read -s DB_PASSWORD
  echo ""
fi

if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET=$(openssl rand -hex 32)
  echo "Generated session secret automatically."
fi

REPO_URL="${REPO_URL:-https://github.com/santoshsd/ca-schools-dashboard.git}"

echo ""
echo "Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo "  Repo: $REPO_URL"
echo ""

echo "Step 1: Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

echo ""
echo "Step 2: Deploying PostgreSQL + App Service (this takes 3-5 minutes)..."
DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file azure/main-nodejs.bicep \
  --parameters dbAdminPassword="$DB_PASSWORD" sessionSecret="$SESSION_SECRET" \
  --query properties.outputs \
  --output json)

APP_NAME=$(echo "$DEPLOY_OUTPUT" | jq -r '.appServiceName.value')
APP_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.appServiceUrl.value')
PG_HOST=$(echo "$DEPLOY_OUTPUT" | jq -r '.postgresHost.value')

echo ""
echo "Infrastructure ready:"
echo "  App: $APP_NAME"
echo "  URL: $APP_URL"
echo "  DB:  $PG_HOST"

DATABASE_URL="postgresql://csdadmin:${DB_PASSWORD}@${PG_HOST}:5432/cadashboard?sslmode=require"

echo ""
echo "Step 3: Building the application..."
npm ci
npm run build

echo ""
echo "Step 4: Deploying code to App Service..."
cd dist
zip -r ../deploy.zip . ../node_modules ../package.json ../shared ../migrations ../drizzle.config.ts
cd ..
az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --src-path deploy.zip \
  --type zip

echo ""
echo "Step 5: Pushing database schema (Drizzle)..."
DATABASE_URL="$DATABASE_URL" npx drizzle-kit push

echo ""
echo "Step 6: Applying P1 schema constraints (indexes, FKs, CHECK)..."
# The CONCURRENTLY index creation commands cannot run inside a transaction,
# so we split the migration: first the CONCURRENTLY parts, then the rest.
# psql handles this correctly when the file uses BEGIN/COMMIT for the
# transactional parts and top-level statements for CONCURRENTLY.
if command -v psql &>/dev/null; then
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$PG_HOST" -U csdadmin -d cadashboard \
    -f migrations/0001_p1_schema_constraints.sql
else
  echo "  psql not found in Cloud Shell. Run the migration manually:"
  echo "  psql \"$DATABASE_URL\" -f migrations/0001_p1_schema_constraints.sql"
fi

echo ""
echo "Step 7: Restarting app..."
az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP"

echo ""
echo "Step 8: Waiting for app to start..."
sleep 10
echo "  Checking health..."
HEALTH=$(curl -sf "${APP_URL}/api/healthz" 2>/dev/null || echo '{"status":"unreachable"}')
echo "  Health response: $HEALTH"

echo ""
echo "============================================="
echo " DEPLOYMENT COMPLETE"
echo "============================================="
echo ""
echo "Your app is live at: $APP_URL"
echo "Health check:        ${APP_URL}/api/healthz"
echo ""
echo "============================================="
echo " NEXT STEPS"
echo "============================================="
echo ""
echo "1. Register a user account:"
echo "   Open ${APP_URL} and click 'Sign Up'"
echo ""
echo "2. Create an API key in the Dashboard"
echo ""
echo "3. Test the API:"
echo "   curl -H 'Authorization: Bearer YOUR_API_KEY' ${APP_URL}/api/v1/counties"
echo ""
echo "4. Trigger data ingestion (from Cloud Shell):"
echo "   DATABASE_URL=\"$DATABASE_URL\" npx tsx server/ingest-cde-data.ts"
echo ""
echo "============================================="
echo " CUSTOM DOMAIN SETUP"
echo "============================================="
echo ""
echo "1. Add a CNAME DNS record at your registrar:"
echo "     Name: cadashboard (or your subdomain)"
echo "     Value: $(echo $APP_URL | sed 's|https://||')"
echo ""
echo "2. Add the custom domain in Azure:"
echo "   az webapp config hostname add \\"
echo "     --webapp-name $APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --hostname YOUR_DOMAIN"
echo ""
echo "3. Enable free managed SSL:"
echo "   az webapp config ssl create \\"
echo "     --name $APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --hostname YOUR_DOMAIN"
echo ""
echo "============================================="
echo " CREDENTIALS (save these somewhere safe)"
echo "============================================="
echo ""
echo "  DB Host: $PG_HOST"
echo "  DB User: csdadmin"
echo "  DB Pass: (the password you entered)"
echo "  DB URL:  postgresql://csdadmin:***@${PG_HOST}:5432/cadashboard?sslmode=require"
echo "  Session Secret: $SESSION_SECRET"
echo ""
