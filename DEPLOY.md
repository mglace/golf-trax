# Deploying GolfTrax to Azure Static Web Apps (Free)

GolfTrax is a static Vite SPA plus a small managed **Azure Function** proxy
(`/api`) that keeps the GolfCourseAPI key server-side. Everything below fits the
**Free** SWA tier.

## Architecture on Azure

- **Static app** (`dist/`) — served from SWA's global CDN over HTTPS.
- **`/api/*`** — SWA **managed Functions** (in `api/`) that forward course
  searches to GolfCourseAPI using the `GOLF_API_KEY` **application setting**
  (never exposed to the browser).
- **SPA routing** — `public/staticwebapp.config.json` rewrites unknown routes to
  `index.html` (so deep links like `/round/:id/summary` work on refresh).

The client auto-selects transport: with `VITE_GOLF_API_KEY` set it calls the API
directly (local dev); without it, it calls `/api` (production). **Do not set
`VITE_GOLF_API_KEY` in the production build.**

## Prerequisites

- An Azure subscription and a GitHub account
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`)
- Your GolfCourseAPI key

## Step 1 — Put the code on GitHub

```bash
git init
git add .
git commit -m "GolfTrax MVP"
git branch -M main
git remote add origin https://github.com/<you>/golf-trax.git
git push -u origin main
```

## Step 2 — Create the Static Web App (CLI)

The Free SKU is available in a limited set of regions (e.g. `eastus2`,
`westus2`, `centralus`, `westeurope`, `eastasia`).

```bash
az group create --name golftrax-rg --location eastus2

# Create WITHOUT linking a repo, so Azure doesn't inject its own workflow —
# we deploy with the workflow already in .github/workflows/.
az staticwebapp create \
  --name golftrax \
  --resource-group golftrax-rg \
  --location eastus2 \
  --sku Free
```

> Prefer the Portal? Create a Static Web App, choose **Other** (not GitHub) as
> the deployment source to avoid a second auto-generated workflow, then continue
> below. (If you *do* let the Portal connect GitHub, delete
> `.github/workflows/azure-static-web-apps.yml` from this repo so you don't get
> duplicate deployments.)

## Step 3 — Set the server-side API key

```bash
az staticwebapp appsettings set \
  --name golftrax --resource-group golftrax-rg \
  --setting-names GOLF_API_KEY=<your-golfcourseapi-key>
```

(Portal equivalent: **Static Web App → Configuration → Application settings**.)

## Step 4 — Wire up CI (deployment token → GitHub secret)

```bash
az staticwebapp secrets list \
  --name golftrax --resource-group golftrax-rg \
  --query "properties.apiKey" -o tsv
```

Copy that token, then in GitHub: **repo → Settings → Secrets and variables →
Actions → New repository secret**:

- **Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN`
- **Value:** the token from above

## Step 5 — Deploy

Push to `main` (or re-run the workflow). GitHub Actions builds the app + Function
and deploys. Find the URL:

```bash
az staticwebapp show --name golftrax --resource-group golftrax-rg \
  --query "defaultHostname" -o tsv
```

Every PR to `main` gets its own free preview environment, torn down on close.

## Local development

**Direct mode (simplest)** — no Functions needed:

```bash
cp .env.example .env.local   # paste your key into VITE_GOLF_API_KEY
npm install
npm run dev                  # http://localhost:5173
```

**Proxy mode (mirrors production, exercises `/api`)** — requires the
[SWA CLI](https://azure.github.io/static-web-apps-cli/) and
[Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local):

```bash
cp api/local.settings.json.example api/local.settings.json   # paste key into GOLF_API_KEY
npm --prefix api install
npm run build
npm run swa:start            # serves app + /api together
```

## Notes & limits (Free tier)

- 100 GB egress/month, 250 MB app size, 2 custom domains, staging environments.
- Data is **local to each browser** (IndexedDB) — no accounts/sync in this MVP,
  so rounds don't roam across devices and won't migrate automatically.
- To rotate the key: update the `GOLF_API_KEY` app setting (no redeploy needed
  for Functions settings).
