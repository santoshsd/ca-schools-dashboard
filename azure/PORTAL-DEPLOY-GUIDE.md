# Deploy to Azure — Browser-Only Guide

No installs required. Everything is done through the Azure Portal in your browser.

---

## Option A: Azure Cloud Shell (Recommended — Fastest)

Azure Cloud Shell is a terminal built into the Azure Portal. It already has Azure CLI, Node.js, Git, and everything else pre-installed.

### Steps

1. **Open Azure Portal** → https://portal.azure.com

2. **Open Cloud Shell** → Click the terminal icon `>_` in the top-right toolbar
   - If this is your first time, choose **Bash** and let it create a storage account

3. **Clone your project** into Cloud Shell:
   ```bash
   git clone https://github.com/santoshsd/ca-schools-dashboard.git
   cd ca-school-dashboard
   ```
   *(Replace with your actual GitHub repo URL. If you haven't pushed to GitHub yet, see "Getting Your Code to GitHub" below.)*

4. **Run the deploy script**:
   ```bash
   export DB_PASSWORD="YourStrongPassword123!"
   bash azure/cloud-shell-deploy.sh
   ```
   This will:
   - Create a PostgreSQL database
   - Create an App Service with Node.js 20
   - Build and deploy the application
   - Set up the database tables and seed data
   - Print your live URL

5. **Set up your custom domain** (after deployment):
   - Go to your DNS provider for `s13i.me`
   - Add a **CNAME** record: `cadashboard` → `csd-app-XXXXX.azurewebsites.net` (the script prints the exact value)
   - In Cloud Shell, run the hostname commands the script prints

---

## Option B: Azure Portal UI (Click-Through)

If you prefer using the Portal interface directly:

### Step 1: Create a Resource Group

1. Go to **portal.azure.com** → Search for **"Resource groups"**
2. Click **+ Create**
3. Name: `ca-school-dashboard-rg`
4. Region: `West US 2` (or your preferred region)
5. Click **Review + Create** → **Create**

### Step 2: Create PostgreSQL Database

1. Search for **"Azure Database for PostgreSQL flexible servers"**
2. Click **+ Create** → **Flexible Server**
3. Fill in:
   - Resource group: `ca-school-dashboard-rg`
   - Server name: `csd-postgres` (must be globally unique, add numbers if taken)
   - Region: Same as resource group
   - PostgreSQL version: **16**
   - Workload type: **Development** (cheapest)
   - Compute + storage: Click **Configure server** → Select **Burstable B1ms** (~$13/month)
   - Admin username: `csdadmin`
   - Password: Choose a strong password (save it!)
4. **Networking** tab:
   - Select **Public access**
   - Check **Allow public access from any Azure service**
5. Click **Review + Create** → **Create** (takes 3-5 minutes)
6. Once created, go to the server → **Databases** → **+ Add**
   - Name: `cadashboard`
   - Click **Save**

### Step 3: Create App Service

1. Search for **"App Services"** → Click **+ Create** → **Web App**
2. Fill in:
   - Resource group: `ca-school-dashboard-rg`
   - Name: `cadashboard-app` (must be globally unique, add numbers if taken)
   - Publish: **Code**
   - Runtime stack: **Node 20 LTS**
   - Operating System: **Linux**
   - Region: Same as your database
   - Pricing plan: Click **Create new** → Select **Basic B1** (~$13/month)
3. Click **Review + Create** → **Create**

### Step 4: Configure App Settings

1. Go to your new App Service → **Settings** → **Environment variables**
2. Add these application settings (click **+ Add** for each):

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | `postgresql://csdadmin:YOUR_PASSWORD@YOUR_PG_SERVER.postgres.database.azure.com:5432/cadashboard?sslmode=require` |
   | `SESSION_SECRET` | Any random string (e.g., generate one at random.org) |
   | `PORT` | `8080` |
   | `NODE_ENV` | `production` |

3. Click **Apply** → **Confirm**

### Step 5: Configure Startup Command

1. In App Service → **Settings** → **Configuration** → **General settings**
2. Set **Startup Command** to: `node dist/index.cjs`
3. Click **Save**

### Step 6: Deploy Your Code

**Option A — GitHub Deployment (Recommended):**
1. Push your code to a GitHub repository
2. In App Service → **Deployment** → **Deployment Center**
3. Source: **GitHub**
4. Sign in to GitHub and select your repository
5. Branch: `main`
6. Build provider: **App Service Build Service** (Oryx)
7. Click **Save**

**Option B — ZIP Deploy via Cloud Shell:**
1. Open Cloud Shell (top-right `>_` icon)
2. Clone your repo and build:
   ```bash
   git clone https://github.com/santoshsd/ca-schools-dashboard.git
   cd ca-school-dashboard
   npm ci && npm run build
   ```
3. Create and deploy a ZIP:
   ```bash
   cd dist && zip -r ../deploy.zip . ../node_modules ../package.json ../shared ../migrations ../drizzle.config.ts && cd ..
   az webapp deploy --resource-group ca-school-dashboard-rg --name YOUR_APP_NAME --src-path deploy.zip --type zip
   ```

### Step 7: Run Database Migration

1. Open Cloud Shell
2. Run:
   ```bash
   export DATABASE_URL="postgresql://csdadmin:YOUR_PASSWORD@YOUR_PG_SERVER.postgres.database.azure.com:5432/cadashboard?sslmode=require"
   cd ca-school-dashboard
   npx drizzle-kit push
   ```

### Step 8: Set Up Custom Domain (cadashboard.s13i.me)

1. **DNS Configuration** (at your domain registrar for s13i.me):
   - Add a CNAME record:
     - Name: `cadashboard`
     - Value: `YOUR_APP_NAME.azurewebsites.net`

2. **Azure Portal**:
   - Go to App Service → **Settings** → **Custom domains**
   - Click **+ Add custom domain**
   - Enter: `cadashboard.s13i.me`
   - Validate and add

3. **Enable HTTPS**:
   - On the Custom domains page, click **Add binding** next to your domain
   - Select **App Service Managed Certificate** (free)
   - Click **Add**

---

## Getting Your Code to GitHub

If your code is only on Replit and you need to push it to GitHub:

1. On Replit, open the **Git** panel (left sidebar, branch icon)
2. Connect to a GitHub repository
3. Push your code

Or from Replit's Shell:
```bash
git remote add origin https://github.com/santoshsd/ca-schools-dashboard.git
git push -u origin main
```

---

## Estimated Monthly Cost

| Resource | SKU | Approx. Cost |
|----------|-----|-------------|
| App Service | Basic B1 | ~$13/month |
| PostgreSQL Flexible Server | Burstable B1ms | ~$13/month |
| **Total** | | **~$26/month** |

*Prices vary by region. You can scale down to Free tier for App Service during testing.*

---

## Troubleshooting

- **App shows "Application Error"**: Check App Service → Diagnose and solve problems → Application Logs
- **Database connection fails**: Verify the DATABASE_URL in Environment variables, ensure the firewall allows Azure services
- **502 Bad Gateway**: Check the startup command is `node dist/index.cjs` and PORT is `8080`
- **Health check**: Visit `https://YOUR_APP.azurewebsites.net/api/healthz` — should return `{"status":"ok"}`
