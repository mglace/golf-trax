# Social share card

## Deployment setup (required — the endpoints 500 without it)

The share endpoints need one Cosmos container and one app setting. Values below
match the existing account in `docs/PHASE2-SETUP.md` (`golftrax-cosmos` in
`golftrax-rg`, database `golftrax`).

> **Windows note.** The PowerShell variants below are not cosmetic — the bash
> `--idx @shares-index.json` is a *parse error* in PowerShell, where `@` starts
> an array expression. They were written from documented shell behaviour rather
> than executed; there is no Windows environment in CI or the dev container.

### 1. Create the `shares` container

Run from the repo root so the relative `shares-index.json` path resolves.

```bash
az cosmosdb sql container create \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --database-name golftrax --name shares \
  --partition-key-path /id \
  --ttl=-1 \
  --idx @shares-index.json
```

```powershell
az cosmosdb sql container create `
  --account-name golftrax-cosmos --resource-group golftrax-rg `
  --database-name golftrax --name shares `
  --partition-key-path /id `
  --ttl=-1 `
  --idx "@shares-index.json"
```

The account is serverless, so there is no `--throughput` flag.

**`--ttl=-1` is not optional.** It turns the TTL feature *on* without expiring
anything by default. Share documents set no `ttl` and so live forever; the
per-IP rate-limit counters set their own `ttl: 7200` and self-GC. With TTL
disabled at the container level, per-item `ttl` is **silently ignored** — the
counters would accumulate forever and never expire. This is the same reasoning
as the `rounds` container, where only tombstones carry a `ttl`.

The `=` form is used rather than `--ttl -1` because az can otherwise parse `-1`
as the start of another flag. `docs/PHASE2-SETUP.md` still shows the spaced form
for the `rounds` container; either works there, but `=` is unambiguous on every
shell.

> **cmd.exe:** continuations are `^` instead of `` ` ``, and `@shares-index.json`
> needs no quoting.

`shares-index.json` excludes `/snapshot/*` — the pars/scores arrays and stat
objects are never queried (the only read path is a point read by `id`), so
indexing them just costs RU on every write. The rest stays indexed so `origin`
and `createdAt` remain queryable for cleanup.

### 2. Add the app settings

`az staticwebapp appsettings set` is an upsert, but **list first and verify
after** — losing `GOLF_API_KEY` or `COSMOS_KEY` would take down course search
and sync:

```bash
az staticwebapp appsettings list \
  --name golftrax --resource-group golftrax-rg -o table

SALT=$(openssl rand -hex 32)
az staticwebapp appsettings set \
  --name golftrax --resource-group golftrax-rg \
  --setting-names "SHARE_IP_SALT=$SALT"

az staticwebapp appsettings list \
  --name golftrax --resource-group golftrax-rg -o table
```

```powershell
az staticwebapp appsettings list `
  --name golftrax --resource-group golftrax-rg -o table

$bytes = New-Object 'byte[]' 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$salt = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''

az staticwebapp appsettings set `
  --name golftrax --resource-group golftrax-rg `
  --setting-names "SHARE_IP_SALT=$salt"

az staticwebapp appsettings list `
  --name golftrax --resource-group golftrax-rg -o table
```

**Hex, not base64.** A base64 salt can contain `=`, which collides with the
`--setting-names KEY=VALUE` parsing and truncates the value — leaving a salt
that is silently shorter than intended.

| App setting | Required | Purpose |
| --- | --- | --- |
| `SHARE_IP_SALT` | yes | Salts the hashed IPs used for rate limiting. Defaults to a constant, which works but makes hashes guessable. |
| `SHARE_RATE_LIMIT` | no | Shares per IP per hour. Defaults to `20`. |
| `PUBLIC_ORIGIN` | no | Fallback origin for share links. Requests normally derive it from the incoming host; the built-in fallback is already `https://golftrax.app`. |

`COSMOS_ENDPOINT` / `COSMOS_KEY` / `COSMOS_DATABASE` are already set for sync and
are reused as-is.

### 3. Verify

```bash
# TTL must report -1, not null.
az cosmosdb sql container show \
  --account-name golftrax-cosmos --resource-group golftrax-rg \
  --database-name golftrax --name shares \
  --query "resource.defaultTtl"

# Create a share and follow it end to end.
curl -sS -X POST https://golftrax.app/api/share \
  -H 'Content-Type: application/json' \
  -d '{"course":"Pine Ridge Golf Club","tee":"White tees",
       "date":"2026-08-15T12:00:00.000Z",
       "pars":[4,5,3,4,4,3,5,4,4],"scores":[5,6,3,4,5,4,6,5,4]}'

# Clean up, with the token the create call returned.
curl -sS -X DELETE https://golftrax.app/api/share/<shareId> \
  -H 'X-GolfTrax-Revoke-Token: <revokeToken>'
```

```powershell
# TTL must report -1, not null.
az cosmosdb sql container show `
  --account-name golftrax-cosmos --resource-group golftrax-rg `
  --database-name golftrax --name shares `
  --query "resource.defaultTtl"

# Invoke-RestMethod rather than curl: `curl` is an alias for Invoke-WebRequest
# in Windows PowerShell 5.1, and passing JSON through native-command quoting is
# a well-known source of pain.
$body = @{
  course = 'Pine Ridge Golf Club'
  tee    = 'White tees'
  date   = '2026-08-15T12:00:00.000Z'
  pars   = @(4,5,3,4,4,3,5,4,4)
  scores = @(5,6,3,4,5,4,6,5,4)
} | ConvertTo-Json -Depth 5

$share = Invoke-RestMethod -Method Post -Uri 'https://golftrax.app/api/share' `
  -ContentType 'application/json' -Body $body
$share

# Font check — expect ~500 KB.
(Invoke-WebRequest -Uri $share.imageUrl).RawContentLength

# Clean up.
Invoke-RestMethod -Method Delete `
  -Uri "https://golftrax.app/api/share/$($share.shareId)" `
  -Headers @{ 'X-GolfTrax-Revoke-Token' = $share.revokeToken }
```

> **cmd.exe:** `curl.exe` ships with Windows 10+, but the JSON body must be one
> line with `\"`-escaped quotes:
> `curl -sS -X POST https://golftrax.app/api/share -H "Content-Type: application/json" -d "{\"course\":\"Pine Ridge Golf Club\",\"tee\":\"White tees\",\"date\":\"2026-08-15T12:00:00.000Z\",\"pars\":[4,5,3,4,4,3,5,4,4],\"scores\":[5,6,3,4,5,4,6,5,4]}"`

A `201` returns `{ shareId, url, imageUrl, revokeToken }`. Then open `url` in a
browser, and confirm the image renders — a **small** PNG (a few hundred bytes
rather than a few hundred KB) means the bundled fonts didn't load, since resvg
draws a blank rather than erroring. Finally paste `url` into Slack or iMessage:
the OG preview is the only thing that can't be verified any other way, and it is
the entire point of the feature.

### Note on preview environments

SWA staging environments inherit production app settings, so a share created
while testing a PR lands in the **production** container, with a link pointing at
a host that dies when the PR closes. Each document records the `origin` it was
created from, so those are identifiable:

```sql
SELECT c.id, c.origin, c.createdAt FROM c
WHERE c.type = 'share' AND NOT CONTAINS(c.origin, 'golftrax.app')
```

---

# Design sample

A **prototype**, not app code. `round-card.html` is a standalone page that renders
a shareable post-round recap card at 1080×1350 (4:5, the Instagram/Facebook feed
crop that also survives an X timeline). `round-card-sample.png` is its output,
generated from hardcoded sample data.

Nothing here is wired into the SPA yet — the whole point is to look at the
composition before deciding how it gets built for real.

## Regenerating the PNG

Open `round-card.html` in a browser and screenshot the `#card-feed` element, or
drive it headlessly:

```js
// node shoot.mjs — from the repo root, after `npm ci`
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1240, height: 1500 } })
await page.goto(`file://${process.cwd()}/docs/social/round-card.html`)
await page.locator('#card-feed').screenshot({ path: 'docs/social/round-card-sample.png' })
await browser.close()
```

Edit the `round` object at the top of the `<script>` block to try other rounds.

## Design decisions worth keeping

**The palette is validated, not eyeballed.** Score tones are
`#34d399` birdie+ / `#94a3b8` par / `#fbbf24` bogey / `#f43f5e` double+. That
exact set clears colorblind separation on every pair against the card's dark
green surface — the more obvious choices (brand `#4ade80` with a red, or an
amber/green pairing) land in the deutan/protan warn band, where a red-green
viewer can't reliably separate a birdie from a blow-up.

**Color never carries meaning alone.** The hole strip encodes vs-par three ways
at once: bar direction (up = under par, down = over), the stroke count printed
above each bar, and hue. The scoring breakdown repeats every color in a labeled
legend with counts.

**The comparison badge is the share trigger.** "4 better than your 10-round
average" is what makes someone post a +10 round — the card has to flatter a
mid-handicapper, not just a good one. It needs a real fallback for a player's
first few rounds, which the sample sidesteps.

**The CTA is the acquisition surface** and must never be cropped, so
`round-card.html` asserts the footer sits inside the frame rather than trusting
the layout. Any future change to the card's height or content needs that check.

## Rasterizer spike — result: viable, with caveats

`api/src/share-card.js` renders the same card as pure SVG on the server, and
`@resvg/resvg-js` rasterizes it to PNG. `round-card-server.png` and
`round-card-server-degraded.png` are its output. This existed to answer one
question — can the OG image be produced in the Functions app at all — and the
answer is yes.

Measured on Node 22 / linux-x64:

| | |
|---|---|
| Render (1080×1350 PNG) | 380–520 ms cold, ~540 KB |
| `@resvg/resvg-js` on disk | 4.3 MB (native `.node` binary) |
| Bundled fonts | ~810 KB for Liberation Sans regular + bold |

**Fonts must be bundled.** With `loadSystemFonts: false` and no `fontFiles`,
resvg renders a 485-byte image — every glyph silently disappears, no error. A
Functions host is not guaranteed to have fonts installed, so the TTFs ship with
the deployment and `defaultFontFamily` is set explicitly. A consequence worth
accepting deliberately: the OG image's typography is frozen to the bundled face
and will not match the app's `system-ui` stack.

**Text width is estimated, not measured.** resvg exposes no metrics API, so
`estWidth` guesses from an average per-character advance. It is good enough to
decide whether a course name shrinks or truncates, and not good enough for
layout — the scoring legend originally collided its counts into its labels and
now uses fixed columns instead. Anything that positions one element from
another's text width is fragile; use fixed columns or `text-anchor` instead.

**Not verified:** that the native binary loads on Azure SWA managed functions.
That cannot be tested from a dev container — it needs a deploy to a preview
environment, and it should be the first thing tried, since everything else in
Phase 1 depends on it. If it fails, the fallback is a separate Function App or
an external image endpoint, not client-uploaded PNGs (see below).

**Rejected: having the client upload its rendered PNG.** It removes the native
dependency, but means accepting arbitrary image bytes from an unauthenticated
endpoint and serving them from the app's own domain. The share payload stays
numbers-only; the server is the only thing that ever draws a card.

## Known gaps

- **Vertical space is not distributed.** The layout flows top-down with the CTA
  pinned to the bottom, so a 9-hole round with untracked stats leaves a ~200px
  void above the footer — visible in `round-card-server-degraded.png`. The card
  needs to either grow/shrink its own height or distribute slack between
  sections.
- `round-card.html` (the browser prototype) still assumes 18 holes and shows all
  three stat tiles unconditionally. The server port handles both; the prototype
  was not back-ported since the server render is the one that ships.
- No 9:16 story crop yet — the other high-traffic placement.
- Bars clamp at ±2 strokes. Deliberate: an unclamped blow-up would rescale the
  strip and flatten every other hole, but it does mean a 9 on a par 4 reads the
  same as a 6.
- `buildModel` in `share-card.js` duplicates scoring logic that belongs in a
  pure `src/domain/shareCard.ts`, with this as its parity-tested JS port.
