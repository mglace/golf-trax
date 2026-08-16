'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Structural guard on the seam between `staticwebapp.config.json` and the
 * functions it rewrites to.
 *
 * A managed function is reachable only at `/api/<its route>`. If a rewrite aims
 * at a path no function claims, SWA returns a bare 404 with nothing in any log
 * to explain it — and because the rewrite is in the SPA's config while the
 * route is in the API workspace, nothing else connects the two. That shipped
 * once: `/r/*` pointed at `/api/share-page` while the function registered
 * `r/{shareId?}`, so `/api/r/{id}` worked and every `/r/{id}` link the app
 * hands to users 404'd.
 */

const FUNCTIONS_DIR = path.join(__dirname, '..', 'src', 'functions')
const SWA_CONFIG = path.join(__dirname, '..', '..', 'public', 'staticwebapp.config.json')

/** Route strings declared by `app.http({ route: '...' })` across the API. */
function registeredRoutes() {
  const routes = []
  for (const file of fs.readdirSync(FUNCTIONS_DIR)) {
    if (!file.endsWith('.js')) continue
    const src = fs.readFileSync(path.join(FUNCTIONS_DIR, file), 'utf8')
    for (const m of src.matchAll(/^\s*route:\s*'([^']+)'/gm)) routes.push(m[1])
  }
  return routes
}

test('every SWA rewrite into /api/ targets a route some function registers', () => {
  const config = JSON.parse(fs.readFileSync(SWA_CONFIG, 'utf8'))
  const routes = registeredRoutes()
  const rewrites = (config.routes || []).filter(
    (r) => typeof r.rewrite === 'string' && r.rewrite.startsWith('/api/'),
  )

  assert.ok(rewrites.length > 0, 'expected at least the /r/* share rewrite')

  for (const r of rewrites) {
    const target = r.rewrite.slice('/api/'.length)
    assert.ok(
      routes.includes(target),
      `staticwebapp.config.json rewrites ${r.route} → ${r.rewrite}, but no function registers route '${target}'. Registered: ${routes.join(', ')}`,
    )
  }
})

test('the public share path is rewritten and excluded from the SPA fallback', () => {
  const config = JSON.parse(fs.readFileSync(SWA_CONFIG, 'utf8'))

  const shareRoute = (config.routes || []).find((r) => r.route === '/r/*')
  assert.ok(shareRoute, '/r/* must be routed or share links fall through to the SPA')
  assert.ok(shareRoute.rewrite, '/r/* must rewrite to the landing-page function')

  // Without the exclusion the navigation fallback serves index.html for /r/*,
  // and a crawler gets the SPA shell with no meta tags instead of the card.
  assert.ok(
    (config.navigationFallback?.exclude || []).includes('/r/*'),
    '/r/* must be excluded from navigationFallback',
  )
})

test('the share landing page is reachable directly as well as via the rewrite', () => {
  // The direct /api/r/{id} form is the fallback for the rewrite itself failing.
  const routes = registeredRoutes()
  assert.ok(routes.includes('share-page'), 'rewrite target')
  assert.ok(
    routes.some((r) => r.startsWith('r/')),
    'direct fallback',
  )
})
