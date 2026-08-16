import { useCallback, useEffect, useRef, useState } from 'react'
import type { Round } from '@/db/types'
import { buildShareCard, shareHighlight, shareTitle } from '@/domain/shareCard'
import { getShareForRound, saveShare } from '@/db/sharesRepo'
import { createShare, ShareError } from '@/api/shareApi'
import { trackEvent } from '@/analytics/gtag'

export type ShareState =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'ready'; url: string; imageUrl: string }
  | { kind: 'error'; message: string; retryable: boolean }

/**
 * Publish a round's card and hand back its link.
 *
 * The API is only called when the user actually asks to share — a golfer
 * finishing a round is very likely to have no signal, and pre-creating links
 * for rounds nobody shares would both waste records and fail at the worst
 * moment.
 *
 * An already-shared round reuses its stored link rather than minting a second
 * one, so reopening an old round from history doesn't orphan share documents.
 */
export function useShare(round: Round | undefined) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' })
  // Guards against setting state after the sheet closes mid-request.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /**
   * One publish per sheet, enforced here rather than by the caller.
   *
   * `round` arrives from `useLiveQuery`, so its identity changes on every
   * Dexie tick; anything keyed on it re-runs. Two overlapping calls would both
   * find no saved share (the first hasn't written yet) and each POST, creating
   * a duplicate orphaned share document on the very first tap. Reset on error
   * so "Try again" still works.
   */
  const started = useRef(false)

  const publish = useCallback(async () => {
    if (!round || started.current) return
    started.current = true
    setState({ kind: 'creating' })

    const existing = await getShareForRound(round.id)
    if (existing) {
      if (alive.current) {
        setState({ kind: 'ready', url: existing.url, imageUrl: existing.imageUrl })
      }
      return
    }

    try {
      // History is only needed for the highlight badge; the caller passes the
      // round itself in the list, matching getCompletedRounds().
      const snapshot = buildShareCard(round, [round])
      const created = await createShare(snapshot)
      await saveShare({
        id: round.id,
        shareId: created.shareId,
        url: created.url,
        imageUrl: created.imageUrl,
        revokeToken: created.revokeToken,
        createdAt: new Date().toISOString(),
      })
      if (alive.current) {
        setState({ kind: 'ready', url: created.url, imageUrl: created.imageUrl })
      }
    } catch (err) {
      // Allow a retry — this is the one path that may run publish again.
      started.current = false
      const shareErr = err instanceof ShareError ? err : null
      if (alive.current) {
        setState({
          kind: 'error',
          message: shareErr?.message ?? 'Something went wrong creating the link.',
          // A rejected payload is a client bug — retrying changes nothing.
          retryable: shareErr?.kind !== 'rejected',
        })
      }
    }
  }, [round])

  return { state, publish }
}

/**
 * Hand a link to the OS share sheet, falling back to the clipboard.
 *
 * Returns which path was taken so the caller can report it — `dismissed` when
 * the user backed out of the native sheet, which is NOT an error.
 */
export async function shareLink(
  round: Round,
  url: string,
): Promise<'shared' | 'copied' | 'dismissed' | 'failed'> {
  const highlight = shareHighlight(round, [round])
  // Non-identifying dimensions only — no round/course ids reach GA (mirrors
  // the rule at the round_started / round_completed call sites).
  const track = (target: string) =>
    trackEvent('round_shared', {
      round_length: round.roundLength,
      hole_count: round.holes.length,
      share_target: target,
      highlight_kind: highlight?.kind ?? 'none',
    })

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: shareTitle(round), text: shareTitle(round), url })
      track('native')
      return 'shared'
    } catch (err) {
      // AbortError means the user closed the share sheet themselves. Treating
      // that as a failure would show an error for a deliberate action.
      if (err instanceof Error && err.name === 'AbortError') return 'dismissed'
      // Any other failure falls through to the clipboard rather than dead-ending.
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    track('copy')
    return 'copied'
  } catch {
    return 'failed'
  }
}
