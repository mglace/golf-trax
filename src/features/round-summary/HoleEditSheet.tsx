import { useEffect } from 'react'
import { Numpad } from '@/features/round-entry/Numpad'
import { HoleExtras } from '@/features/round-entry/HoleExtras'
import { XIcon } from '@/components/icons'
import { useDialogFocus } from '@/components/useDialogFocus'
import type { HoleEntry } from '@/db/types'

interface HoleEditSheetProps {
  hole: HoleEntry
  /** Position within the round, used to reset the numpad buffer per hole. */
  index: number
  onChange: (patch: Partial<HoleEntry>) => void
  onClose: () => void
}

/**
 * Bottom-sheet editor for a single hole. Reuses the on-course Numpad and
 * HoleExtras so editing is consistent with entry. Changes persist immediately.
 */
export function HoleEditSheet({ hole, index, onChange, onClose }: HoleEditSheetProps) {
  const sheetRef = useDialogFocus<HTMLDivElement>()

  // Close on Escape for keyboard/desktop use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit hole ${hole.holeNumber}`}
        className="pb-safe w-full max-w-md rounded-t-2xl bg-slate-50 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-slate-900">Hole {hole.holeNumber}</p>
            <p className="text-xs text-slate-500">
              Par {hole.par} · {hole.yardage.toLocaleString()} yds · S.I. {hole.handicap}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-200"
          >
            <XIcon className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <Numpad
          key={index}
          value={hole.score}
          par={hole.par}
          onChange={(score) => onChange({ score })}
        />

        <div className="mt-5">
          <HoleExtras hole={hole} onChange={onChange} />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-fairway-700 py-3 font-semibold text-white shadow-sm active:bg-fairway-800"
        >
          Done
        </button>
      </div>
    </div>
  )
}
