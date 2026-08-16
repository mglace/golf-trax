'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildModel, renderShareSvg, formatCardDate, layoutSections } = require('../src/share-card')

/**
 * The share card is rendered ONLY here, on the server — the app displays this
 * output rather than drawing its own preview, so there is no second renderer to
 * keep in lockstep. These tests cover the snapshot → render-model derivation
 * and the degradation cases that real rounds actually produce.
 */

const PAR72 = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4]
const SCORES_82 = [5, 6, 3, 4, 5, 4, 6, 5, 4, 4, 2, 6, 5, 4, 4, 6, 4, 5]

function snapshot(over = {}) {
  return {
    course: 'Pine Ridge Golf Club',
    tee: 'White tees',
    date: '2026-08-15T12:00:00.000Z',
    pars: PAR72,
    scores: SCORES_82,
    holeNumbers: PAR72.map((_, i) => i + 1),
    ...over,
  }
}

test('buildModel: totals and vs-par', () => {
  const m = buildModel(snapshot())
  assert.equal(m.totalPar, 72)
  assert.equal(m.totalScore, 82)
  assert.equal(m.vsPar, 10)
})

test('buildModel: scoring counts cover every hole exactly once', () => {
  const m = buildModel(snapshot())
  assert.deepEqual(m.counts, { birdie: 2, par: 5, bogey: 10, double: 1 })
  const total = m.counts.birdie + m.counts.par + m.counts.bogey + m.counts.double
  assert.equal(total, 18)
})

test('buildModel: 18-hole rounds get OUT/IN split', () => {
  const m = buildModel(snapshot())
  assert.match(m.splitLabel, /OUT 42 \+6/)
  assert.match(m.splitLabel, /IN 40 \+4/)
})

test('buildModel: 9-hole rounds get a single total instead of OUT/IN', () => {
  const pars = PAR72.slice(9)
  const m = buildModel(
    snapshot({ pars, scores: pars.map((p) => p + 1), holeNumbers: [10, 11, 12, 13, 14, 15, 16, 17, 18] }),
  )
  assert.match(m.splitLabel, /TOTAL/)
  assert.doesNotMatch(m.splitLabel, /OUT/)
})

test('buildModel: back-9 rounds keep absolute hole numbers', () => {
  const pars = PAR72.slice(9)
  const m = buildModel(
    snapshot({ pars, scores: pars.map((p) => p + 1), holeNumbers: [10, 11, 12, 13, 14, 15, 16, 17, 18] }),
  )
  assert.deepEqual(m.holeNumbers, [10, 11, 12, 13, 14, 15, 16, 17, 18])
})

test('buildModel: tiles are capped at three so the row cannot overflow', () => {
  const m = buildModel(
    snapshot({
      fairways: { hit: 8, opp: 14 },
      gir: { hit: 5, opp: 18 },
      putts: { total: 32, avg: '1.8' },
    }),
  )
  assert.equal(m.tiles.length, 3)
  assert.deepEqual(
    m.tiles.map((t) => t.label),
    ['FAIRWAYS', 'GREENS IN REG', 'PUTTS / HOLE'],
  )
})

test('buildModel: degrades to what was tracked instead of printing dashes', () => {
  // No putts entered means no GIR either — GIR is derived from putts.
  const m = buildModel(snapshot({ fairways: { hit: 3, opp: 7 } }))
  const labels = m.tiles.map((t) => t.label)
  assert.ok(labels.includes('FAIRWAYS'))
  assert.ok(!labels.includes('GREENS IN REG'))
  assert.ok(!labels.includes('PUTTS / HOLE'))
  // A always-derivable tile backfills so the row is never empty.
  assert.ok(labels.includes('PARS OR BETTER'))
})

test('buildModel: badge is null when the round is unremarkable', () => {
  assert.equal(buildModel(snapshot()).badgeText, null)
  assert.equal(buildModel(snapshot({ badgeText: 'Your best round yet' })).badgeText, 'Your best round yet')
})

test('formatCardDate: renders a stable label regardless of server locale', () => {
  // The card is a shared image — it must look the same to everyone who sees it,
  // not to whoever's machine drew it.
  assert.equal(formatCardDate('2026-08-15T12:00:00.000Z'), 'Sat, Aug 15')
})

test('formatCardDate: an unparseable date degrades to empty, not "Invalid Date"', () => {
  assert.equal(formatCardDate('not-a-date'), '')
})

/**
 * The card is a fixed 1080x1350 crop but its content is not fixed — a 9-hole
 * round with nothing tracked is far shorter than a full 18 with three stat
 * tiles. These assert that the layout absorbs that difference instead of
 * pooling it into a dead zone above the CTA, which is what a real shared card
 * looked like before this existed.
 */
const CTA_TOP = 1350 - 138

/** Where the last section ends, given a layout. */
function contentBottom(layout) {
  return (
    layout.startY +
    layout.gap * layout.sections.length +
    layout.sections.reduce((a, s) => a + s.height, 0)
  )
}

const SPARSE = () => {
  const pars = PAR72.slice(9)
  return snapshot({
    pars,
    scores: pars.map((p) => p + 1),
    holeNumbers: [10, 11, 12, 13, 14, 15, 16, 17, 18],
  })
}

const FULL = () =>
  snapshot({
    fairways: { hit: 8, opp: 14 },
    gir: { hit: 5, opp: 18 },
    putts: { total: 32, avg: '1.8' },
    badgeText: '4 better than your 10-round average',
  })

test('layoutSections: a full round fills the frame without overrunning the CTA', () => {
  const layout = layoutSections(buildModel(FULL()), 62)
  assert.ok(contentBottom(layout) <= CTA_TOP + 1, 'content must not overlap the CTA')
  assert.ok(CTA_TOP - contentBottom(layout) < 2, 'content should reach the CTA')
})

test('layoutSections: a sparse round leaves no dead zone above the CTA', () => {
  // The regression: 9 holes, no stats, no badge. Previously ~a quarter of the
  // card was empty here.
  const layout = layoutSections(buildModel(SPARSE()), 62)
  assert.ok(CTA_TOP - contentBottom(layout) < 2)
})

test('layoutSections: sparser content gets larger gaps, not a gap at the end', () => {
  const full = layoutSections(buildModel(FULL()), 62)
  const sparse = layoutSections(buildModel(SPARSE()), 62)
  assert.ok(sparse.gap > full.gap, 'slack goes into the gaps')
  assert.ok(sparse.gap <= 72, 'but not so far that sections read as unrelated')
  assert.ok(full.gap >= 30, 'and never so tight that the card looks cramped')
})

test('layoutSections: omits sections the round has no data for', () => {
  const ids = layoutSections(buildModel(SPARSE()), 62).sections.map((s) => s.id)
  assert.ok(!ids.includes('badge'))
  assert.ok(ids.includes('tiles')) // "pars or better" always backfills one
  assert.deepEqual(layoutSections(buildModel(FULL()), 62).sections.map((s) => s.id), [
    'course',
    'badge',
    'hero',
    'strip',
    'tiles',
    'scoring',
  ])
})

test('renderShareSvg: produces a well-formed 1080x1350 document', () => {
  const svg = renderShareSvg(buildModel(snapshot()))
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1080" height="1350"/)
  assert.ok(svg.endsWith('</svg>'))
})

test('renderShareSvg: escapes course names so a card cannot inject markup', () => {
  // The course name is the one free-text field, and manual courses are
  // user-typed, so it reaches the renderer unvetted.
  const svg = renderShareSvg(buildModel(snapshot({ course: '<script>alert(1)</script>' })))
  assert.ok(!svg.includes('<script>'))
  assert.ok(svg.includes('&lt;script&gt;'))
})

test('renderShareSvg: a long course name is truncated rather than overflowing', () => {
  const svg = renderShareSvg(
    buildModel(snapshot({ course: 'The Links at Wentworth-by-the-Sea Country Club' })),
  )
  assert.ok(svg.includes('…'))
})

test('renderShareSvg: always carries the acquisition CTA', () => {
  // The CTA is the whole point of the feature — a card without it is a leak.
  const svg = renderShareSvg(buildModel(snapshot()))
  assert.ok(svg.includes('golftrax.app'))
})
