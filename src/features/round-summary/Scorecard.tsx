import { buildScorecard, scoreTone, SCORE_TONE_CLASS } from '@/domain/scorecard'
import type { HoleEntry, RoundLength } from '@/db/types'

interface ScorecardProps {
  holes: HoleEntry[]
  roundLength: RoundLength
  onEditHole: (index: number) => void
}

/**
 * Horizontally-scrollable scorecard grid: Hole / Par / Score rows with OUT / IN
 * / TOT subtotals. Score cells are tappable to edit that hole.
 */
export function Scorecard({ holes, roundLength, onEditHole }: ScorecardProps) {
  const columns = buildScorecard(holes, roundLength)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-center text-sm">
        <tbody>
          {/* Hole numbers */}
          <tr className="bg-slate-50">
            <Th>Hole</Th>
            {columns.map((col, i) => (
              <td
                key={`h-${i}`}
                className={[
                  'min-w-[2.25rem] px-1 py-1.5 text-xs font-semibold',
                  col.type === 'subtotal' ? 'bg-slate-100 text-slate-500' : 'text-slate-500',
                ].join(' ')}
              >
                {col.label}
              </td>
            ))}
          </tr>

          {/* Par */}
          <tr>
            <Th>Par</Th>
            {columns.map((col, i) => (
              <td
                key={`p-${i}`}
                className={[
                  'px-1 py-1.5 text-xs tabular-nums text-slate-500',
                  col.type === 'subtotal' ? 'bg-slate-50 font-semibold' : '',
                ].join(' ')}
              >
                {col.par}
              </td>
            ))}
          </tr>

          {/* Score */}
          <tr>
            <Th>Score</Th>
            {columns.map((col, i) => {
              if (col.type === 'subtotal') {
                return (
                  <td
                    key={`s-${i}`}
                    className="bg-slate-50 px-1 py-1.5 text-sm font-bold tabular-nums text-slate-900"
                  >
                    {col.score ?? '–'}
                  </td>
                )
              }
              const tone = scoreTone(col.score, col.par)
              return (
                <td key={`s-${i}`} className="px-0.5 py-1">
                  <button
                    type="button"
                    onClick={() => onEditHole(col.holeIndex)}
                    aria-label={`Edit hole ${col.label}`}
                    className="mx-auto flex h-8 w-8 items-center justify-center text-sm font-bold tabular-nums transition-transform active:scale-95"
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center ${SCORE_TONE_CLASS[tone]}`}
                    >
                      {col.score ?? '+'}
                    </span>
                  </button>
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="sticky left-0 z-10 bg-inherit px-2 py-1.5 text-left text-xs font-semibold text-slate-500">
      {children}
    </th>
  )
}
