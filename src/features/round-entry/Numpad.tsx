import { useState } from 'react'
import { XIcon } from '@/components/icons'

interface NumpadProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  par: number
  /** Sensible guardrails; a hole score realistically lands in [1, 20]. */
  max?: number
}

/**
 * Large touch numpad for score entry. Calculator-style: the first digit press
 * after landing on a hole replaces the existing value, then further presses
 * append (up to 2 digits). Mount with a `key` per hole to reset this behavior.
 */
export function Numpad({ value, onChange, par, max = 20 }: NumpadProps) {
  const [buffer, setBuffer] = useState<string>(value?.toString() ?? '')
  const [touched, setTouched] = useState(false)

  function commit(next: string) {
    setBuffer(next)
    const n = next === '' ? undefined : Number(next)
    onChange(n !== undefined && n >= 1 ? n : undefined)
  }

  function pressDigit(d: number) {
    const base = touched ? buffer : ''
    let next = `${base}${d}`
    // Cap at two digits and at the configured max.
    if (next.length > 2) next = String(d)
    if (Number(next) > max) next = String(d)
    setTouched(true)
    commit(next)
  }

  function backspace() {
    setTouched(true)
    commit(buffer.slice(0, -1))
  }

  function setToPar() {
    setTouched(true)
    commit(String(par))
  }

  const display = buffer === '' ? '–' : buffer
  const diff = buffer === '' ? null : Number(buffer) - par

  return (
    <div>
      <div className="mb-3 flex items-end justify-center gap-3">
        <span
          className="text-6xl font-bold tabular-nums text-slate-900"
          aria-live="polite"
          aria-label={buffer === '' ? 'No score entered' : `Score ${buffer}`}
        >
          {display}
        </span>
        {diff !== null && (
          <span
            className={[
              'mb-2 rounded-full px-2 py-0.5 text-sm font-semibold',
              diff < 0
                ? 'bg-fairway-100 text-fairway-800'
                : diff === 0
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-amber-100 text-amber-800',
            ].join(' ')}
          >
            {diff === 0 ? 'Par' : diff > 0 ? `+${diff}` : diff}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => pressDigit(d)}
            className="h-16 rounded-xl border border-slate-200 bg-white text-2xl font-semibold text-slate-800 shadow-sm active:bg-fairway-50 active:text-fairway-800"
          >
            {d}
          </button>
        ))}

        <button
          type="button"
          onClick={setToPar}
          className="h-16 rounded-xl border border-fairway-200 bg-fairway-50 text-sm font-semibold text-fairway-800 shadow-sm active:bg-fairway-100"
        >
          Par {par}
        </button>

        <button
          type="button"
          onClick={() => pressDigit(0)}
          className="h-16 rounded-xl border border-slate-200 bg-white text-2xl font-semibold text-slate-800 shadow-sm active:bg-fairway-50"
        >
          0
        </button>

        <button
          type="button"
          onClick={backspace}
          aria-label="Delete"
          className="flex h-16 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm active:bg-slate-100"
        >
          <XIcon className="h-6 w-6" aria-hidden />
        </button>
      </div>
    </div>
  )
}
