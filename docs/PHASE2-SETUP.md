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

1. **Auth0 passwordless is in-plan.** The **Passwordless: Email** connection is
   available on the free/essentials tiers, but confirm for your tenant. GolfTrax
   uses the **email code** variant (a numeric code the user types back into the
   app), **not** the magic link — the app renders its own sign-in form and never
   redirects to an Auth0-hosted page (PHASE2.md §4).
2. **A production email provider is configured.** Auth0's built-in dev email is
   **rate-limited and not for production**. Wire up a real provider (SendGrid,
   Mailgun, Amazon SES, etc.) under **Auth0 → Branding → Email Provider** before
   go-live, or code delivery will throttle (a throttled/undelivered email reads
   to the user as "the code never came").
3. **Cost check.** Serverless Cosmos is pay-per-request and Auth0 bills by
   monthly active users (MAU). For a personal app both sit comfortably in free
   allowances, but confirm the projected MAU + RU/storage against current
   pricing so sync doesn't introduce a surprise bill.

## 1. Auth0 — dedicated GolfTrax tenant/application

GolfTrax uses a **dedicated** Auth0 application and user directory — it shares
no identities with any other product (PHASE2.md §1.3).

1. Create (or reuse) an Auth0 tenant for GolfTrax.

   > **The live issuer is the custom domain `auth.golftrax.app`.** The
   > underlying tenant is still `dev-t2f04o583lwuw2ii.us.auth0.com`
   > (auto-generated at signup) — a custom domain fronts the tenant, it does not
   > replace it. Everything in this doc that takes a "domain" wants
   > `auth.golftrax.app`, and tokens carry `iss: https://auth.golftrax.app/`
   > (trailing slash included).
   >
   > **Why a custom domain and not a renamed/new tenant.** Auth0 tenant names are
   > immutable — not changeable via the dashboard, the Management API, or the
   > CLI, and a deleted tenant's name is burned permanently. Only `friendly_name`
   > (the display name on the dashboard and Universal Login screens) is editable,
   > via `PATCH /api/v2/tenants/settings`. A custom domain keeps the same tenant,
   > so user `sub` values are unchanged and synced data stays attached to its
   > owner. A *new* tenant would issue new `sub` values and orphan every synced
   > round in Cosmos (PHASE2.md §4) — a data migration, not a rename. The Free
   > plan includes one custom domain (credit card on file required for
   > verification; not charged).
   >
   > **Cutting the domain over is a lockstep change.** `VITE_AUTH0_DOMAIN` (build
   > time) and `AUTH0_DOMAIN` (SWA app setting) must move together —
   > `api/src/auth.js` derives both the expected issuer and the JWKS URI from
   > `AUTH0_DOMAIN`, so while the two disagree every sync request 401s. The
   > workflow value only takes effect on the next deploy, so there is an
   > unavoidable brief window whichever side you change first; only sync is
   > affected, local round entry keeps working. Existing sessions must re-login
   > after the cutover because `iss` changed, but `sub` is unchanged so nothing
   > in Cosmos is orphaned.
   >
   > Sanity-check a cutover with:
   > ```bash
   > curl -s https://auth.golftrax.app/.well-known/openid-configuration
   > curl -s https://auth.golftrax.app/.well-known/jwks.json
   > ```
   > A fresh custom domain can serve a TLS handshake failure for a few minutes
   > while Auth0 provisions the certificate — retry before assuming it's broken.

2. **Applications → Create Application → Single Page Web Application.** Note the
   **Domain** and **Client ID**.
   - **Allowed Web Origins** and **Allowed Origins (CORS):** your app origin(s),
     e.g. `http://localhost:5173` for dev and your SWA hostname for prod. Both
     lists matter here: the SPA calls `/passwordless/start` and `/oauth/token`
     directly from the browser, so those origins must be CORS-allowed or every
     sign-in fails at the network layer.
   - **Callback / Logout URLs** are not used by the embedded flow (there is no
     redirect), but setting them to the same origins does no harm.
   - **Settings → Advanced → Grant Types:** enable **Passwordless OTP** and
     **Refresh Token** (in addition to the defaults). Without the former the
     code exchange 403s; without the latter no refresh token is issued and
     sessions can't survive silently.
   - **Settings → Refresh Token Rotation:** set to **Rotating** with an
     inactivity/absolute expiry. A browser SPA only gets durable refresh tokens
     with rotation on.
   - **Cross-Origin Authentication:** with the custom domain (`auth.golftrax.app`)
     fronting the tenant, the token/passwordless calls are first-party, so no
     third-party-cookie workarounds are needed.
   - **Attack Protection (important for the embedded flow):** calling
     `/passwordless/start` and the OTP grant directly from the SPA means Auth0's
     hosted-page bot protection no longer applies, so:
     - **Do not enable Bot Detection** on this tenant. Its CAPTCHA challenge is
       rendered by the hosted Universal Login page, which this embedded form
       doesn't show; with it on, sign-in fails with a `captcha`/`unauthorized`
       error the UI can only surface as the generic "Couldn't send a code."
     - **Do enable Suspicious IP Throttling and Brute-Force Protection.** Without
       the hosted page, the public `client_id` + `/passwordless/start` is an
       unauthenticated "email an arbitrary address from your tenant" endpoint and
       the 6-digit code is guarded only by per-tenant rate limits; these two
       Attack Protection features are the mitigation.
3. **Authentication → Passwordless → Email:** enable the **Email** connection and
   turn it on for the SPA application. The app requests `send: 'code'` per
   sign-in, so the emailed credential is a numeric code — no magic-link template
   or callback to configure. Configure the email **template** (subject/body) if
   you want to brand it.
4. **APIs → Create API** for the backend audience, e.g. identifier
   `https://api.golftrax.app` (this string is the `AUTH0_AUDIENCE` /
   `VITE_AUTH0_AUDIENCE`; it does not have to resolve to a real URL). Signing
   algorithm **RS256**. Enable **Allow Offline Access** so refresh tokens are
   issued for this audience.

### Client (SPA) settings

Set these in `.env.local` for dev (see `.env.example`) and as build-time
environment variables in CI for prod. They are **public** (a passwordless SPA
has no client secret):

| Variable | Value |
| --- | --- |
| `VITE_AUTH0_DOMAIN` | the Auth0 domain (no scheme) — live value `auth.golftrax.app` |
| `VITE_AUTH0_CLIENT_ID` | the SPA application's Client ID |
| `VITE_AUTH0_AUDIENCE` | the API identifier, e.g. `https://api.golftrax.app` |

### Server (Functions) settings

The Functions backend validates tokens against Auth0's JWKS and derives the
user id from the `sub` claim (PHASE2.md §4). It deliberately does **not** use
SWA EasyAuth, keeping the backend issuer-agnostic (§1.4).

| App setting | Value |
| --- | --- |
| `AUTH0_DOMAIN` | the Auth0 domain (no scheme) — live value `auth.golftrax.app`; must match `VITE_AUTH0_DOMAIN` |
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
# `pull` orders by (serverTs ASC, id ASC) for stable keyset paging, so the
# container needs a matching composite index (see rounds-index.json below).
az cosmosdb sql container create \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --database-name golftrax --name rounds \
  --partition-key-path /userId \
  --ttl -1 \
  --idx @rounds-index.json   # TTL enabled but no default expiry; tombstones set their own ttl

# profile: one doc per user (id === userId).
az cosmosdb sql container create \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --database-name golftrax --name profile \
  --partition-key-path /userId
```

> `--ttl -1` turns the TTL feature **on** for the container without expiring
> live documents; only tombstones carry a positive per-item `ttl`, so live
> rounds never expire while deleted ones GC after 90 days.

The `rounds-index.json` referenced above keeps the default indexing and adds the
composite index `pull` needs for its `ORDER BY c.serverTs ASC, c.id ASC` (a total
order is required so keyset paging can't skip records that share a timestamp —
PHASE2.md §11.9):

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "includedPaths": [{ "path": "/*" }],
  "excludedPaths": [{ "path": "/\"_etag\"/?" }],
  "compositeIndexes": [
    [
      { "path": "/serverTs", "order": "ascending" },
      { "path": "/id", "order": "ascending" }
    ]
  ]
}
```

> `pull` paginates on **`serverTs`** — a server-stamped epoch-ms field on each
> round — rather than the Cosmos-native `_ts`. `_ts` is a *system* property, and
> composite indexes over system paths aren't reliably supported; a user-owned
> field is always indexable, and epoch-ms also gives finer resolution than
> `_ts`'s seconds. The server sets `serverTs` on every accepted write.

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
    AUTH0_DOMAIN=auth.golftrax.app \
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
