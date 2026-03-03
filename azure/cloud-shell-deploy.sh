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

REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/ca-school-dashboard.git}"

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

echo ""
echo "Step 3: Building the application..."
npm ci
npm run build

echo ""
echo "Step 4: Deploying code to App Service..."
cd dist
zip -r ../deploy.zip . ../node_modules ../package.json ../shared
cd ..
az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --src-path deploy.zip \
  --type zip

echo ""
echo "Step 5: Pushing database schema..."
DATABASE_URL="postgresql://csdadmin:${DB_PASSWORD}@${PG_HOST}:5432/cadashboard?sslmode=require"
DATABASE_URL="$DATABASE_URL" npx drizzle-kit push

echo ""
echo "Step 6: Restarting app..."
az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP"

echo ""
echo "============================================="
echo " DEPLOYMENT COMPLETE"
echo "============================================="
echo ""
echo "Your app is live at: $APP_URL"
echo ""
echo "============================================="
echo " CUSTOM DOMAIN SETUP (cadashboard.s13i.me)"
echo "============================================="
echo ""
echo "1. Go to your DNS provider for s13i.me"
echo "2. Add a CNAME record:"
echo "     Name: cadashboard"
echo "     Value: $(echo $APP_URL | sed 's|https://||')"
echo ""
echo "3. Then run these commands to add the domain:"
echo ""
echo "   az webapp config hostname add \\"
echo "     --webapp-name $APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --hostname cadashboard.s13i.me"
echo ""
echo "   az webapp config ssl create \\"
echo "     --name $APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --hostname cadashboard.s13i.me"
echo ""
echo "============================================="
echo " CREDENTIALS (save these somewhere safe)"
echo "============================================="
echo ""
echo "  DB Host: $PG_HOST"
echo "  DB User: csdadmin"
echo "  DB Pass: (the password you entered)"
echo "  Session Secret: $SESSION_SECRET"
echo ""
