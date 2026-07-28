import { fairwayApplies } from '@/domain/round'
import type { HoleEntry } from '@/db/types'

interface HoleExtrasProps {
  hole: HoleEntry
  onChange: (patch: Partial<HoleEntry>) => void
}

const PUTT_OPTIONS = [0, 1, 2, 3, 4, 5]

/**
 * Optional per-hole detail: fairway hit (par 4/5 only), putts, and the derived
 * GIR indicator. All optional — tapping a selected chip again clears it.
 */
export function HoleExtras({ hole, onChange }: HoleExtrasProps) {
  const showFairway = fairwayApplies(hole.par)

  return (
    <div className="space-y-4">
      {showFairway && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-600">Fairway</p>
          <div className="grid grid-cols-2 gap-2">
            <FairwayButton
              label="Hit"
              active={hole.fairwayHit === true}
              tone="good"
              onClick={() => onChange({ fairwayHit: hole.fairwayHit === true ? undefined : true })}
            />
            <FairwayButton
              label="Miss"
              active={hole.fairwayHit === false}
              tone="bad"
              onClick={() =>
                onChange({ fairwayHit: hole.fairwayHit === false ? undefined : false })
              }
            />
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Putts</p>
          <GirBadge gir={hole.gir} />
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {PUTT_OPTIONS.map((p) => {
            const active = hole.putts === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ putts: active ? undefined : p })}
                className={[
                  'h-11 rounded-lg border text-base font-semibold shadow-sm transition-colors',
                  active
                    ? 'border-fairway-500 bg-fairway-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50',
                ].join(' ')}
                aria-pressed={active}
                aria-label={`${p} putts`}
              >
                {p === 5 ? '5+' : p}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">Optional — leave blank to skip putt tracking.</p>
      </div>
    </div>
  )
}

function FairwayButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string
  active: boolean
  tone: 'good' | 'bad'
  onClick: () => void
}) {
  const activeClasses =
    tone === 'good'
      ? 'border-fairway-500 bg-fairway-600 text-white'
      : 'border-amber-500 bg-amber-500 text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'h-12 rounded-xl border text-base font-semibold shadow-sm transition-colors',
        active ? activeClasses : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function GirBadge({ gir }: { gir: boolean | undefined }) {
  if (gir === undefined) {
    return (
      <span className="text-xs font-medium text-slate-500" aria-label="Green in regulation: not tracked">
        GIR —
      </span>
    )
  }
  return (
    <span
      aria-label={gir ? 'Green in regulation: yes' : 'Green in regulation: no'}
      className={[
        'rounded-full px-2 py-0.5 text-xs font-semibold',
        gir ? 'bg-fairway-100 text-fairway-800' : 'bg-slate-100 text-slate-500',
      ].join(' ')}
    >
      <span aria-hidden="true">{gir ? 'GIR ✓' : 'GIR ✗'}</span>
    </span>
  )
}
