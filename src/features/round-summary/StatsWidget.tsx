import { computeRoundStats } from '@/domain/round'
import { scoreTone } from '@/domain/scorecard'
import type { HoleEntry } from '@/db/types'

interface StatsWidgetProps {
  holes: HoleEntry[]
}

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`
}

/**
 * Scoped round stats: fairways %, GIR %, and putts are computed only over the
 * holes where each is known, so they're correct for both 9- and 18-hole rounds.
 */
export function StatsWidget({ holes }: StatsWidgetProps) {
  const stats = computeRoundStats(holes)

  // Scoring breakdown over entered holes.
  let birdieOrBetter = 0
  let pars = 0
  let bogeys = 0
  let doublePlus = 0
  for (const h of holes) {
    const tone = scoreTone(h.score, h.par)
    if (tone === 'eagle' || tone === 'birdie') birdieOrBetter += 1
    else if (tone === 'par') pars += 1
    else if (tone === 'bogey') bogeys += 1
    else if (tone === 'double') doublePlus += 1
  }

  const avgPutts =
    stats.puttsKnown > 0 ? (stats.totalPutts / stats.puttsKnown).toFixed(1) : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Fairways"
          value={pct(stats.fairwayPct)}
          sub={
            stats.fairwayOpportunities > 0
              ? `${stats.fairwaysHit}/${stats.fairwayOpportunities}`
              : 'not tracked'
          }
        />
        <StatCard
          label="GIR"
          value={pct(stats.girPct)}
          sub={stats.girKnown > 0 ? `${stats.girHit}/${stats.girKnown}` : 'needs putts'}
        />
        <StatCard
          label="Putts"
          value={avgPutts === null ? '—' : avgPutts}
          sub={stats.puttsKnown > 0 ? `${stats.totalPutts} total` : 'not tracked'}
        />
      </div>

      <div className="flex items-stretch gap-2">
        <ScoreChip label="Birdie+" count={birdieOrBetter} tone="text-fairway-700" />
        <ScoreChip label="Par" count={pars} tone="text-slate-700" />
        <ScoreChip label="Bogey" count={bogeys} tone="text-amber-700" />
        <ScoreChip label="Dbl+" count={doublePlus} tone="text-red-700" />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  )
}

function ScoreChip({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-center shadow-sm">
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{count}</p>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  )
}
