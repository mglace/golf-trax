import { computeTotals, formatVsPar, ROUND_LENGTH_LABEL } from '@/domain/round'
import { formatRoundDate } from '@/domain/history'
import type { Round } from '@/db/types'

interface RoundHistoryCardProps {
  round: Round
  now: Date
}

/**
 * Compact, presentational round card: date, course, length, score, vs par.
 * Tap/keyboard activation and delete are handled by the wrapping SwipeableRow.
 */
export function RoundHistoryCard({ round, now }: RoundHistoryCardProps) {
  const totals = computeTotals(round.holes)

  return (
    <div className="flex items-center gap-3 border-y border-l border-slate-200 p-3">
      <div className="w-12 shrink-0 text-center">
        <p className="text-xs font-semibold uppercase leading-tight text-fairway-700">
          {formatRoundDate(round.date, now)}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{round.courseName}</p>
        <p className="truncate text-xs text-slate-500">
          {round.teeName} · {ROUND_LENGTH_LABEL[round.roundLength]}
          {!totals.isComplete && ` · ${totals.holesEntered}/${totals.holesTotal} holes`}
        </p>
      </div>

      <div className="shrink-0 pr-1 text-right">
        <p className="text-xl font-bold tabular-nums leading-none text-slate-900">
          {totals.totalScore}
        </p>
        <p className="mt-0.5 text-xs font-semibold tabular-nums text-fairway-700">
          {formatVsPar(totals.vsPar)}
        </p>
      </div>
    </div>
  )
}
