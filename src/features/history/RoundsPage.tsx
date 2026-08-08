import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCompletedRounds, deleteRound } from '@/db/roundsRepo'
import { groupRoundsByDate } from '@/domain/history'
import { RoundHistoryCard } from './RoundHistoryCard'
import { SwipeableRow } from './SwipeableRow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ListIcon, SpinnerIcon } from '@/components/icons'

/**
 * Round History (Milestone 5): completed rounds newest-first, grouped by date,
 * tap-through to the summary, swipe/keyboard delete with confirmation.
 * (In-progress drafts live on the Home screen's resume card.)
 */
export function RoundsPage() {
  const navigate = useNavigate()
  const rounds = useLiveQuery(() => getCompletedRounds(), [])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // A stable "now" per render is fine for date bucketing.
  const now = new Date()

  if (rounds === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <SpinnerIcon className="h-6 w-6" aria-hidden />
        <span className="text-sm">Loading rounds…</span>
      </div>
    )
  }

  if (rounds.length === 0) {
    return (
      <div className="py-6">
        <div className="mt-10 flex flex-col items-center gap-3 text-center text-slate-500">
          <ListIcon className="h-10 w-10" aria-hidden />
          <p className="text-sm">
            No rounds recorded yet. Finish a round and it’ll show up here.
          </p>
          <button
            type="button"
            onClick={() => navigate('/new')}
            className="mt-2 rounded-xl bg-fairway-700 px-4 py-2 font-semibold text-white"
          >
            Start a round
          </button>
        </div>
      </div>
    )
  }

  const groups = groupRoundsByDate(rounds, now)

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return
    await deleteRound(pendingDeleteId)
    setPendingDeleteId(null)
  }

  return (
    <div className="py-6">
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">{group.label}</h2>
            <ul className="space-y-2">
              {group.rounds.map((round) => (
                <li key={round.id}>
                  <SwipeableRow
                    tapLabel={`${round.courseName} round`}
                    onTap={() => navigate(`/round/${round.id}/summary`)}
                    onDelete={() => setPendingDeleteId(round.id)}
                  >
                    <RoundHistoryCard round={round} now={now} />
                  </SwipeableRow>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete this round?"
          message="This permanently removes the round and its scores. This can’t be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  )
}
