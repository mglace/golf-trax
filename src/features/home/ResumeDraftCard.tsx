import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDraftRounds } from '@/db/roundsRepo'
import { computeTotals, ROUND_LENGTH_LABEL } from '@/domain/round'
import { ChevronRightIcon } from '@/components/icons'

/**
 * Shows in-progress (draft) rounds on the home screen so the player can resume
 * where they left off. Renders nothing when there are no drafts.
 */
export function ResumeDraftCard() {
  const drafts = useLiveQuery(() => getDraftRounds(), [], [])

  if (!drafts || drafts.length === 0) return null

  return (
    <section aria-labelledby="resume-heading" className="mt-6">
      <h2 id="resume-heading" className="mb-2 text-sm font-semibold text-slate-600">
        Continue playing
      </h2>
      <ul className="space-y-2">
        {drafts.map((round) => {
          const totals = computeTotals(round.holes)
          return (
            <li key={round.id}>
              <Link
                to={`/round/${round.id}`}
                className="flex items-center gap-3 rounded-xl border border-fairway-200 bg-fairway-50/50 p-4 shadow-sm transition-colors hover:bg-fairway-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{round.courseName}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {round.teeName} · {ROUND_LENGTH_LABEL[round.roundLength]} ·{' '}
                    <span className="font-medium text-fairway-700">
                      thru {totals.holesEntered}/{totals.holesTotal}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-fairway-700 px-3 py-1.5 text-sm font-semibold text-white">
                  Resume
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-fairway-400" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
