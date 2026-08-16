'use strict'

/**
 * GET /r/{shareId} — the public landing page for a shared round.
 *
 * Reached via a rewrite in `staticwebapp.config.json`, because managed
 * functions are only routable under `/api/*`. Verified on a live preview
 * environment: the rewrite fires, and the original path survives in
 * `x-ms-original-url` (see share-request.js).
 *
 * This page has two audiences and must serve both:
 *  - Crawlers (Facebook, X, iMessage, Slack), which read only the meta tags and
 *    never run JavaScript — hence server-rendered HTML rather than the SPA.
 *  - Humans who tap the link, who should see the card and a reason to install.
 *    That CTA is the entire point of the feature.
 */

const { app } = require('@azure/functions')
const { json } = require('../shared')
const { getShare } = require('../share-store')
const { buildModel } = require('../share-card')
const { shareIdFromPath, publicOrigin } = require('../share-request')

/** Short, so CTA copy can be changed without stale pages lingering. */
const PAGE_CACHE = 'public, max-age=300'

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

function signed(n) {
  return n > 0 ? `+${n}` : n === 0 ? 'even' : String(n)
}

function page({ model, imageUrl, pageUrl, appUrl }) {
  const title = `${model.totalScore} at ${model.course} · ${signed(model.vsPar)}`
  const description = model.badgeText
    ? `${model.badgeText}. Tracked with GolfTrax.`
    : `${model.subtitle}. Tracked with GolfTrax.`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — GolfTrax</title>
<meta name="description" content="${esc(description)}" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="GolfTrax" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:image" content="${esc(imageUrl)}" />
<meta property="og:image:width" content="1080" />
<meta property="og:image:height" content="1350" />
<meta property="og:image:alt" content="${esc(title)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(imageUrl)}" />

<link rel="icon" href="/favicon.svg" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex; flex-direction: column; align-items: center;
    gap: 28px; padding: 32px 20px 56px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #fff;
    background: linear-gradient(168deg, #0d2e1e 0%, #071b12 55%, #050f0b 100%);
  }
  img.card {
    width: 100%; max-width: 480px; height: auto;
    border-radius: 20px; box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  }
  .cta { width: 100%; max-width: 480px; text-align: center; }
  .cta h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.015em; }
  .cta p { margin-top: 10px; font-size: 16px; line-height: 1.5; color: #a9c6b6; }
  .cta a {
    display: block; margin-top: 20px; padding: 16px 24px;
    border-radius: 999px; background: #34d399; color: #052e1e;
    font-size: 18px; font-weight: 700; text-decoration: none;
  }
  footer { font-size: 13px; color: #6d8b7b; }
</style>
</head>
<body>
  <img class="card" src="${esc(imageUrl)}" width="1080" height="1350" alt="${esc(title)}" />
  <div class="cta">
    <h1>Track your rounds. Free.</h1>
    <p>GolfTrax works offline on the course and needs no account. Enter your scores, see your stats, share your best rounds.</p>
    <a href="${esc(appUrl)}">Open GolfTrax</a>
  </div>
  <footer>Shared from GolfTrax</footer>
</body>
</html>`
}

/**
 * The rewrite target. `staticwebapp.config.json` sends `/r/*` here, so this
 * route name must match that `rewrite` value EXACTLY.
 *
 * A managed function is only reachable at `/api/<its route>`, so aiming the
 * rewrite at a path no function claims produces a bare 404 with nothing to
 * explain it. That happened: an earlier version registered only
 * `r/{shareId?}`, which made `/api/r/{id}` work while every `/r/{id}` link the
 * app actually hands out 404'd — the pretty URL is the one users get.
 *
 * The rewrite erases the routed path, so the id comes from `x-ms-original-url`.
 */
app.http('share-page', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'share-page',
  handler: async (request, context) => handleSharePage(request, context),
})

/**
 * Direct `/api/r/{shareId}` access — a fallback that doesn't depend on the
 * rewrite, which is exactly the failure mode this pair now covers.
 */
app.http('share-page-direct', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'r/{shareId?}',
  handler: async (request, context) => handleSharePage(request, context),
})

async function handleSharePage(request, context) {
  const shareId = shareIdFromPath(request) || request.params.shareId
  if (!shareId || !/^[A-Za-z0-9_-]+$/.test(shareId)) {
    return json(400, { error: 'Invalid share id.' })
  }

  let share
  try {
    share = await getShare(shareId)
  } catch (err) {
    context.error('Failed to load share', err)
    return json(500, { error: 'Could not load the share.' })
  }
  if (!share) {
    return {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      body: '<!doctype html><meta charset="utf-8"><title>Not found — GolfTrax</title><p>This round is no longer shared. <a href="/">Open GolfTrax</a></p>',
    }
  }

  const origin = publicOrigin(request)
  const html = page({
    model: buildModel(share.snapshot),
    imageUrl: `${origin}/api/share/${shareId}/image.png`,
    pageUrl: `${origin}/r/${shareId}`,
    // UTM so landings from a share are separable from organic traffic.
    appUrl: `${origin}/?utm_source=share&utm_medium=social&utm_campaign=round_card`,
  })

  return {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': PAGE_CACHE },
    body: html,
  }
}
