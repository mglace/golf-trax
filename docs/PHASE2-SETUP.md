# Phase 2 setup — Auth0 + Cosmos DB (optional account sync)

This document covers provisioning the backend that Phase 2's optional
cross-device sync depends on. It implements the decisions in
[`docs/PHASE2.md`](./PHASE2.md).

> **Sync is optional.** With none of these settings configured, GolfTrax runs
> exactly like the MVP — offline-first, local-only, no login. Everything below
> only *enables* sign-in + sync; it never becomes required to log or view
> rounds (PHASE2.md §1, §2).

## Pre-flight (do this first — PHASE2.md §11.7)

Before writing any sync code against real infrastructure, confirm:

1. **Auth0 passwordless is in-plan.** The **Passwordless: Email** (magic link)
   connection is available on the free/essentials tiers, but confirm for your
   tenant.
2. **A production email provider is configured.** Auth0's built-in dev email is
   **rate-limited and not for production**. Wire up a real provider (SendGrid,
   Mailgun, Amazon SES, etc.) under **Auth0 → Branding → Email Provider** before
   go-live, or magic-link delivery will throttle.
3. **Cost check.** Serverless Cosmos is pay-per-request and Auth0 bills by
   monthly active users (MAU). For a personal app both sit comfortably in free
   allowances, but confirm the projected MAU + RU/storage against current
   pricing so sync doesn't introduce a surprise bill.

## 1. Auth0 — dedicated GolfTrax tenant/application

GolfTrax uses a **dedicated** Auth0 application and user directory — it shares
no identities with any other product (PHASE2.md §1.3).

1. Create (or reuse) an Auth0 tenant for GolfTrax.
2. **Applications → Create Application → Single Page Web Application.** Note the
   **Domain** and **Client ID**.
   - **Allowed Callback URLs / Logout URLs / Web Origins:** your app origin(s),
     e.g. `http://localhost:5173` for dev and your SWA hostname for prod.
3. **Authentication → Passwordless → Email:** enable the **magic link** flow.
   Enable the Email connection for the SPA application.
4. **APIs → Create API** for the backend audience, e.g. identifier
   `https://api.golftrax.app` (this string is the `AUTH0_AUDIENCE` /
   `VITE_AUTH0_AUDIENCE`; it does not have to resolve to a real URL). Signing
   algorithm **RS256**.

### Client (SPA) settings

Set these in `.env.local` for dev (see `.env.example`) and as build-time
environment variables in CI for prod. They are **public** (a passwordless SPA
has no client secret):

| Variable | Value |
| --- | --- |
| `VITE_AUTH0_DOMAIN` | your tenant domain, e.g. `golftrax.us.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | the SPA application's Client ID |
| `VITE_AUTH0_AUDIENCE` | the API identifier, e.g. `https://api.golftrax.app` |

### Server (Functions) settings

The Functions backend validates tokens against Auth0's JWKS and derives the
user id from the `sub` claim (PHASE2.md §4). It deliberately does **not** use
SWA EasyAuth, keeping the backend issuer-agnostic (§1.4).

| App setting | Value |
| --- | --- |
| `AUTH0_DOMAIN` | your tenant domain (no scheme), e.g. `golftrax.us.auth0.com` |
| `AUTH0_AUDIENCE` | must match `VITE_AUTH0_AUDIENCE` |

## 2. Cosmos DB — serverless account

Two containers, both partitioned by `/userId` (PHASE2.md §5.1):

```bash
az cosmosdb create \
  --name golftrax-cosmos --resource-group golftrax-rg \
  --capabilities EnableServerless \
  --locations regionName=eastus2

az cosmosdb sql database create \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --name golftrax

# rounds: one doc per round, incl. tombstones (per-item TTL enabled so
# tombstones self-GC 90 days after deletedAt — PHASE2.md §11.3).
az cosmosdb sql container create \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --database-name golftrax --name rounds \
  --partition-key-path /userId \
  --ttl -1   # TTL enabled but no default expiry; tombstones set their own ttl

# profile: one doc per user (id === userId).
az cosmosdb sql container create \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --database-name golftrax --name profile \
  --partition-key-path /userId
```

> `--ttl -1` turns the TTL feature **on** for the container without expiring
> live documents; only tombstones carry a positive per-item `ttl`, so live
> rounds never expire while deleted ones GC after 90 days.

### Server (Functions) settings

| App setting | Value |
| --- | --- |
| `COSMOS_ENDPOINT` | e.g. `https://golftrax-cosmos.documents.azure.com:443/` |
| `COSMOS_KEY` | a primary key from **Keys** (or use managed identity later) |
| `COSMOS_DATABASE` | `golftrax` (defaults to `golftrax` if unset) |

Fetch the endpoint/key:

```bash
az cosmosdb show --name golftrax-cosmos --resource-group golftrax-rg \
  --query "documentEndpoint" -o tsv
az cosmosdb keys list --name golftrax-cosmos --resource-group golftrax-rg \
  --query "primaryMasterKey" -o tsv
```

## 3. Apply the app settings

```bash
az staticwebapp appsettings set \
  --name golftrax --resource-group golftrax-rg \
  --setting-names \
    AUTH0_DOMAIN=golftrax.us.auth0.com \
    AUTH0_AUDIENCE=https://api.golftrax.app \
    COSMOS_ENDPOINT=https://golftrax-cosmos.documents.azure.com:443/ \
    COSMOS_KEY=<primary-key> \
    COSMOS_DATABASE=golftrax
```

For local proxy-mode dev, copy the same values into
`api/local.settings.json` (see `api/local.settings.json.example`).

## 4. Verify the auth path (slice 2a)

With the settings in place and an access token from the SPA:

```bash
# 401 without a token:
curl -i https://<host>/api/profile

# 200 with a valid token; body is { "profile": null } until first PUT:
curl -i -H "Authorization: Bearer $TOKEN" https://<host>/api/profile

# Upsert a display name (server stamps version/serverUpdatedAt):
curl -i -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Matt"}' https://<host>/api/profile
```

A successful round-trip exercises token issuance → JWKS validation → a per-user
Cosmos read/write end to end, before any round-sync logic exists.
