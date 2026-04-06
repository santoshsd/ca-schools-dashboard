#!/bin/bash
set -euo pipefail

# Docker-based deployment to Azure App Service + ACR.
# Prerequisites: Azure CLI, Docker, jq installed locally.

RESOURCE_GROUP="${RESOURCE_GROUP:-ca-school-dashboard-rg}"
LOCATION="${LOCATION:-westus2}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD environment variable}"
SESSION_SECRET="${SESSION_SECRET:?Set SESSION_SECRET environment variable}"

echo "=== CA School Dashboard - Azure Docker Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo ""

echo "1. Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

echo ""
echo "2. Deploying infrastructure (Bicep)..."
DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file azure/main.bicep \
  --parameters dbAdminPassword="$DB_PASSWORD" sessionSecret="$SESSION_SECRET" \
  --query properties.outputs \
  --output json)

ACR_NAME=$(echo "$DEPLOY_OUTPUT" | jq -r '.acrName.value')
ACR_LOGIN_SERVER=$(echo "$DEPLOY_OUTPUT" | jq -r '.acrLoginServer.value')
APP_SERVICE_NAME=$(echo "$DEPLOY_OUTPUT" | jq -r '.appServiceName.value')
APP_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.appServiceUrl.value')
PG_HOST=$(echo "$DEPLOY_OUTPUT" | jq -r '.postgresHost.value')

DATABASE_URL="postgresql://csdadmin:${DB_PASSWORD}@${PG_HOST}:5432/cadashboard?sslmode=require"

echo ""
echo "Infrastructure deployed:"
echo "  ACR: $ACR_LOGIN_SERVER"
echo "  App Service: $APP_SERVICE_NAME"
echo "  App URL: $APP_URL"
echo "  PostgreSQL: $PG_HOST"

echo ""
echo "3. Building and pushing Docker image..."
az acr login --name "$ACR_NAME"
docker build -t "$ACR_LOGIN_SERVER/cadashboard:latest" .
docker push "$ACR_LOGIN_SERVER/cadashboard:latest"

echo ""
echo "4. Running database migrations..."
DATABASE_URL="$DATABASE_URL" npx drizzle-kit push

echo ""
echo "5. Applying P1 schema constraints..."
if command -v psql &>/dev/null; then
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$PG_HOST" -U csdadmin -d cadashboard \
    -f migrations/0001_p1_schema_constraints.sql
else
  echo "  psql not available locally. Run the migration from Azure Cloud Shell:"
  echo "  psql \"$DATABASE_URL\" -f migrations/0001_p1_schema_constraints.sql"
fi

echo ""
echo "6. Restarting App Service..."
az webapp restart --name "$APP_SERVICE_NAME" --resource-group "$RESOURCE_GROUP"

echo ""
echo "7. Health check..."
sleep 10
HEALTH=$(curl -sf "${APP_URL}/api/healthz" 2>/dev/null || echo '{"status":"unreachable"}')
echo "  $HEALTH"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "App URL: $APP_URL"
echo ""
echo "=== Custom Domain Setup ==="
echo "1. Add a CNAME DNS record:"
echo "   your-subdomain -> $(echo $APP_URL | sed 's|https://||')"
echo ""
echo "2. Add the custom domain:"
echo "   az webapp config hostname add \\"
echo "     --webapp-name $APP_SERVICE_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --hostname YOUR_DOMAIN"
echo ""
echo "3. Enable free managed SSL:"
echo "   az webapp config ssl create \\"
echo "     --name $APP_SERVICE_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --hostname YOUR_DOMAIN"
