'use strict'

/**
 * TEMPORARY probe — delete once the real share functions land.
 *
 * Two things in the share design cannot be verified from a dev container, and
 * everything else depends on both. This endpoint settles them in one deploy:
 *
 *   1. Does the `@resvg/resvg-js` native binary actually LOAD in the Functions
 *      host? We only know it installs during the Oryx build.
 *   2. Does a `staticwebapp.config.json` rewrite from `/r/*` to a function work
 *      on the Free tier, and if so, how does the function recover the original
 *      path? (Managed functions are only routable under `/api/*`, so the public
 *      share URL depends on this.)
 *
 * Usage once deployed to a preview environment:
 *   GET /api/share-preview          → PNG of the sample card  (settles #1)
 *   GET /api/share-preview?diag=1   → JSON diagnostics         (settles #1 detail)
 *   GET /r/anything?diag=1          → JSON diagnostics         (settles #2)
 *
 * The diag view deliberately reports errors as JSON with a stack instead of
 * letting the host return an opaque 500, because "it 500s" would not tell us
 * which of the two unknowns failed.
 */

const { app } = require('@azure/functions')
const { json } = require('../shared')
const { renderShareSvg, buildModel } = require('../share-card')
const { fontStatus, fontOptions } = require('../fonts')

/** The same sample round the design docs render, so output is comparable. */
const SAMPLE = {
  course: 'Pine Ridge Golf Club',
  place: 'Coventry, RI',
  tee: 'White tees',
  dateLabel: 'Sat, Aug 15',
  pars: [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4],
  scores: [5, 6, 3, 4, 5, 4, 6, 5, 4, 4, 2, 6, 5, 4, 4, 6, 4, 5],
  fairways: { hit: 8, opp: 14 },
  gir: { hit: 5, opp: 18 },
  putts: { total: 32, avg: '1.8' },
  badgeText: '4 better than your 10-round average',
}

/**
 * Headers SWA adds when it rewrites. `x-ms-original-url` is the one the real
 * `/r/{shareId}` handler would parse the id out of — this confirms whether it
 * is present and what it contains.
 */
function routingInfo(request) {
  const interesting = [
    'x-ms-original-url',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-ms-forwarded-client-ip',
  ]
  const seen = {}
  for (const name of interesting) {
    const v = request.headers.get(name)
    if (v !== null && v !== undefined) seen[name] = v
  }
  return { url: request.url, method: request.method, headers: seen }
}

app.http('share-preview', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'share-preview',
  handler: async (request, context) => handle(request, context),
})

/**
 * Second registration so the `/r/*` rewrite has a target while probing. The
 * real implementation will point `/r/*` at the share-page function instead.
 */
app.http('share-probe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'share-probe',
  handler: async (request, context) => handle(request, context),
})

async function handle(request, context) {
  const diag = new URL(request.url).searchParams.get('diag') === '1'

  if (diag) {
    const report = { routing: routingInfo(request), fonts: fontStatus() }
    try {
      // Required lazily so a load failure is reported rather than breaking
      // registration of the whole function app at startup.
      const { Resvg } = require('@resvg/resvg-js')
      report.resvgLoaded = true

      const started = Date.now()
      const png = new Resvg(renderShareSvg(buildModel(SAMPLE)), { font: fontOptions() })
        .render()
        .asPng()
      report.render = { ok: true, bytes: png.length, ms: Date.now() - started }

      // A tiny PNG means resvg ran but drew nothing — the silent font failure.
      if (png.length < 20000) {
        report.render.warning = 'Suspiciously small PNG — fonts likely failed to load.'
      }
    } catch (err) {
      context.error('share-preview diagnostics failed', err)
      report.resvgLoaded = report.resvgLoaded ?? false
      report.error = { message: String(err && err.message), stack: String(err && err.stack) }
    }
    return json(200, report)
  }

  try {
    const { Resvg } = require('@resvg/resvg-js')
    const png = new Resvg(renderShareSvg(buildModel(SAMPLE)), { font: fontOptions() })
      .render()
      .asPng()
    return {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
      body: png,
    }
  } catch (err) {
    context.error('share-preview render failed', err)
    return json(500, { error: String(err && err.message) })
  }
}
