/**
 * Zustand store for the round currently being entered. Holds the round in
 * memory for snappy input and auto-saves every mutation to IndexedDB so a
 * closed/refreshed app can resume the draft with no data loss.
 */
import { create } from 'zustand'
import { db } from '@/db/db'
import { getRound } from '@/db/roundsRepo'
import { deriveGir, computeTotals } from '@/domain/round'
import type { HoleEntry, Round } from '@/db/types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'not-found'

interface ActiveRoundState {
  round: Round | null
  status: LoadStatus
  currentIndex: number

  /** Load a round by id into the store (no-op if already loaded). */
  load: (id: string) => Promise<void>
  setCurrentIndex: (index: number) => void
  /** Merge a patch into the hole at `index`, re-derive GIR, and auto-save. */
  patchHole: (index: number, patch: Partial<HoleEntry>) => void
  clear: () => void
}

/** Recompute derived fields and persist (fire-and-forget; Dexie serializes writes). */
function persist(round: Round): Round {
  const totals = computeTotals(round.holes)
  const next: Round = {
    ...round,
    totalScore: totals.totalScore,
    totalPar: totals.totalPar,
    updatedAt: new Date().toISOString(),
    // Mark dirty on every write (§5.2); drafts are filtered out of the push by
    // status (§11.11), so a dirty draft is never actually synced.
    dirty: 1,
  }
  void db.rounds.put(next)
  return next
}

export const useActiveRound = create<ActiveRoundState>((set, get) => ({
  round: null,
  status: 'idle',
  currentIndex: 0,

  load: async (id) => {
    const current = get().round
    if (current?.id === id && get().status === 'ready') return
    set({ status: 'loading', round: null, currentIndex: 0 })
    const round = await getRound(id)
    if (!round) {
      set({ status: 'not-found', round: null })
      return
    }
    // Resume at the first hole without a score, else the first hole.
    const firstUnscored = round.holes.findIndex((h) => h.score === undefined)
    set({
      round,
      status: 'ready',
      currentIndex: firstUnscored === -1 ? 0 : firstUnscored,
    })
  },

  setCurrentIndex: (index) => {
    const round = get().round
    if (!round) return
    const clamped = Math.max(0, Math.min(index, round.holes.length - 1))
    set({ currentIndex: clamped })
  },

  patchHole: (index, patch) => {
    const round = get().round
    if (!round) return
    const holes = round.holes.map((h, i) => {
      if (i !== index) return h
      const merged: HoleEntry = { ...h, ...patch }
      // GIR is always kept consistent with score+putts.
      merged.gir = deriveGir(merged.par, merged.score, merged.putts)
      return merged
    })
    set({ round: persist({ ...round, holes }) })
  },

  clear: () => set({ round: null, status: 'idle', currentIndex: 0 }),
}))
