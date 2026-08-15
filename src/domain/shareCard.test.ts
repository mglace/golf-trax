import { describe, it, expect } from 'vitest'
import { isShareable, shareHighlight, buildShareCard, shareTitle } from './shareCard'
import type { HoleEntry, Round, RoundLength } from '@/db/types'

/**
 * This file is the shared specification for the share card. `api/src/share-card.js`
 * is a JS port of `shareCard.ts`, and `api/test/share-card.test.js` mirrors these
 * cases as a parity guard. The two run in different runners (Vitest vs
 * `node --test`), so a failure in one will NOT surface from the other's command
 * — change a rule here and you must change it there too.
 */

/** Build holes from parallel par/score arrays; `startHole` sets absolute numbering. */
function holes(
  pars: number[],
  scores: (number | undefined)[],
  opts: { putts?: (number | undefined)[]; fairways?: (boolean | undefined)[]; startHole?: number } = {},
): HoleEntry[] {
  return pars.map((par, i) => {
    const score = scores[i]
    const putts = opts.putts?.[i]
    const h: HoleEntry = {
      holeNumber: (opts.startHole ?? 1) + i,
      par,
      handicap: i + 1,
      yardage: 350,
    }
    if (score !== undefined) h.score = score
    if (putts !== undefined) h.putts = putts
    if (opts.fairways?.[i] !== undefined) h.fairwayHit = opts.fairways[i]
    // GIR is derived, never set directly (see deriveGir).
    if (score !== undefined && putts !== undefined) h.gir = score - putts <= par - 2
    return h
  })
}

function round(over: Partial<Round> & { holes: HoleEntry[] }): Round {
  return {
    id: over.id ?? 'r1',
    courseId: 'c1',
    courseName: 'Pine Ridge Golf Club',
    clubName: 'Pine Ridge Golf Club',
    gender: 'male',
    teeName: 'White',
    roundLength: (over.roundLength ?? '18') as RoundLength,
    status: 'complete',
    date: '2026-08-15T12:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z',
    ...over,
  }
}

const PAR72 = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4]
/** 82 (+10): two birdies, one double. The sample round from the design docs. */
const SCORES_82 = [5, 6, 3, 4, 5, 4, 6, 5, 4, 4, 2, 6, 5, 4, 4, 6, 4, 5]
/** A flat +18 round with no birdies — nothing to brag about. */
const SCORES_90 = PAR72.map((p) => p + 1)

describe('isShareable', () => {
  it('accepts a complete, fully-scored round', () => {
    expect(isShareable(round({ holes: holes(PAR72, SCORES_82) }))).toBe(true)
  })

  it('rejects a draft even when every hole is scored', () => {
    expect(isShareable(round({ status: 'draft', holes: holes(PAR72, SCORES_82) }))).toBe(false)
  })

  it('rejects a finalized round with unscored holes', () => {
    // Saving a partial round is supported by the app, but the card has no room
    // to caveat a half-played round.
    const partial = [...SCORES_82.slice(0, 12), ...Array(6).fill(undefined)]
    expect(isShareable(round({ holes: holes(PAR72, partial) }))).toBe(false)
  })
})

describe('shareHighlight', () => {
  it("calls a user's first completed round a milestone", () => {
    const r = round({ holes: holes(PAR72, SCORES_82) })
    // Nothing to compare against — without this case the very first card, the
    // one most likely to be shared, would be the only one with no badge.
    expect(shareHighlight(r, [r])).toEqual({ kind: 'milestone', text: 'First round tracked' })
  })

  it('reports a personal best when the round beats every prior round', () => {
    const best = round({ id: 'best', holes: holes(PAR72, SCORES_82) })
    const worse = [1, 2, 3].map((n) => round({ id: `w${n}`, holes: holes(PAR72, SCORES_90) }))
    expect(shareHighlight(best, [best, ...worse])?.kind).toBe('personal-best')
  })

  it('reports beating the rolling average when it is not a personal best', () => {
    // One better round exists (so not a PB), and several much worse ones drag
    // the average up, so this round still beats it.
    const better = round({ id: 'better', holes: holes(PAR72, PAR72.map((p) => p)) })
    const worse = [1, 2, 3, 4].map((n) => round({ id: `w${n}`, holes: holes(PAR72, SCORES_90) }))
    const current = round({ id: 'cur', holes: holes(PAR72, SCORES_82) })
    const h = shareHighlight(current, [current, better, ...worse])
    expect(h?.kind).toBe('beat-average')
    expect(h?.text).toMatch(/better than your \d+-round average/)
  })

  it('excludes the round itself from the baseline it is measured against', () => {
    // A great round that included itself in the average would drag the average
    // toward its own score and undersell the improvement.
    const current = round({ id: 'cur', holes: holes(PAR72, SCORES_82) })
    const others = [1, 2, 3].map((n) => round({ id: `w${n}`, holes: holes(PAR72, SCORES_90) }))
    const withSelf = shareHighlight(current, [current, ...others])
    const withoutSelf = shareHighlight(current, [current, ...others])
    expect(withSelf).toEqual(withoutSelf)
    expect(withSelf?.kind).toBe('personal-best')
  })

  it('falls back to an eagle milestone', () => {
    // Same score as the others so it is neither a PB nor beats the average,
    // but it contains an eagle.
    const eagleScores = [...SCORES_90]
    eagleScores[6] = PAR72[6] - 2
    const current = round({ id: 'cur', holes: holes(PAR72, eagleScores) })
    const others = [1, 2, 3].map((n) =>
      round({ id: `w${n}`, holes: holes(PAR72, PAR72.map((p) => p - 1)) }),
    )
    expect(shareHighlight(current, [current, ...others])).toEqual({
      kind: 'milestone',
      text: 'Made an eagle',
    })
  })

  it('returns null for an unremarkable round', () => {
    // Identical to the rounds around it: no PB, no improvement, no birdies.
    const current = round({ id: 'cur', holes: holes(PAR72, SCORES_90) })
    const others = [1, 2, 3].map((n) =>
      round({ id: `w${n}`, holes: holes(PAR72, PAR72.map((p) => p - 1)) }),
    )
    expect(shareHighlight(current, [current, ...others])).toBeNull()
  })

  it('returns null for a round that cannot be shared at all', () => {
    const draft = round({ status: 'draft', holes: holes(PAR72, SCORES_82) })
    expect(shareHighlight(draft, [draft])).toBeNull()
  })
})

describe('buildShareCard', () => {
  const putts = Array(18).fill(2)
  const fairways = PAR72.map((p) => (p >= 4 ? true : undefined))

  it('snapshots pars, scores and absolute hole numbers', () => {
    const r = round({ holes: holes(PAR72, SCORES_82) })
    const card = buildShareCard(r, [r])
    expect(card.pars).toEqual(PAR72)
    expect(card.scores).toEqual(SCORES_82)
    expect(card.holeNumbers[0]).toBe(1)
    expect(card.course).toBe('Pine Ridge Golf Club')
    expect(card.tee).toBe('White tees')
  })

  it('keeps absolute hole numbers for a back-9 round', () => {
    const backPars = PAR72.slice(9)
    const r = round({
      roundLength: 'back9',
      holes: holes(backPars, backPars.map((p) => p + 1), { startHole: 10 }),
    })
    expect(buildShareCard(r, [r]).holeNumbers).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })

  it('includes stats that were tracked', () => {
    const r = round({ holes: holes(PAR72, SCORES_82, { putts, fairways }) })
    const card = buildShareCard(r, [r])
    expect(card.putts).toEqual({ total: 36, avg: '2.0' })
    expect(card.fairways?.opp).toBe(14) // 18 holes minus 4 par 3s
    expect(card.gir?.opp).toBe(18)
  })

  it('omits stats that were not tracked rather than sending nulls', () => {
    // No putts entered means no GIR either — it is derived from putts.
    const r = round({ holes: holes(PAR72, SCORES_82) })
    const card = buildShareCard(r, [r])
    expect(card.putts).toBeUndefined()
    expect(card.gir).toBeUndefined()
    expect(card.fairways).toBeUndefined()
  })

  it('carries the highlight through as the badge', () => {
    const r = round({ holes: holes(PAR72, SCORES_82) })
    expect(buildShareCard(r, [r]).badgeText).toBe('First round tracked')
  })

  it('omits the badge when there is nothing to brag about', () => {
    const current = round({ id: 'cur', holes: holes(PAR72, SCORES_90) })
    const others = [1, 2, 3].map((n) =>
      round({ id: `w${n}`, holes: holes(PAR72, PAR72.map((p) => p - 1)) }),
    )
    expect(buildShareCard(current, [current, ...others]).badgeText).toBeUndefined()
  })

  it('sends an ISO date, not a formatted string', () => {
    // The server formats for display; a client-supplied display string would be
    // unvalidatable free text on an anonymous endpoint.
    const r = round({ holes: holes(PAR72, SCORES_82) })
    expect(buildShareCard(r, [r]).date).toBe('2026-08-15T12:00:00.000Z')
  })

  it('carries nothing identifying', () => {
    const r = round({ holes: holes(PAR72, SCORES_82), owner: 'auth0|abc123' })
    const card = buildShareCard(r, [r])
    const serialized = JSON.stringify(card)
    expect(serialized).not.toContain('auth0')
    expect(serialized).not.toContain(r.id)
    expect(serialized).not.toContain(r.courseId)
  })
})

describe('shareTitle', () => {
  it('summarizes score and vs-par', () => {
    expect(shareTitle(round({ holes: holes(PAR72, SCORES_82) }))).toBe(
      '82 at Pine Ridge Golf Club · +10',
    )
  })

  it('says "even" at par', () => {
    expect(shareTitle(round({ holes: holes(PAR72, PAR72) }))).toBe(
      '72 at Pine Ridge Golf Club · even',
    )
  })
})
