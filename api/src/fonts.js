'use strict'

/**
 * Font resolution for server-side card rendering.
 *
 * resvg does not use system fonts unless told to, and a Functions host is not
 * guaranteed to have any installed. Worse, when it can't find a face it renders
 * a **blank image rather than throwing** — a silent failure that looks like a
 * successful response. So the TTFs are bundled with the deployment and the
 * paths are verified explicitly before we hand them to resvg.
 */

const fs = require('fs')
const path = require('path')

/** `api/fonts/` — Oryx copies the whole api directory, non-JS assets included. */
const FONT_DIR = path.join(__dirname, '..', 'fonts')

const FONT_FILES = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf'].map((f) =>
  path.join(FONT_DIR, f),
)

/** The family name the SVG's `font-family` must match. */
const FONT_FAMILY = 'Liberation Sans'

/**
 * resvg font options, or throw if the faces aren't on disk.
 *
 * Throwing is deliberate: a missing font produces a blank card, and a 500 that
 * names the missing path is far easier to diagnose than an image of nothing.
 */
function fontOptions() {
  const missing = FONT_FILES.filter((f) => !fs.existsSync(f))
  if (missing.length > 0) {
    throw new Error(`Bundled fonts missing from the deployment: ${missing.join(', ')}`)
  }
  return {
    loadSystemFonts: false,
    fontFiles: FONT_FILES,
    defaultFontFamily: FONT_FAMILY,
  }
}

/** Non-throwing variant for diagnostics endpoints. */
function fontStatus() {
  return FONT_FILES.map((f) => ({
    path: f,
    exists: fs.existsSync(f),
    bytes: fs.existsSync(f) ? fs.statSync(f).size : 0,
  }))
}

module.exports = { fontOptions, fontStatus, FONT_FAMILY, FONT_DIR }
