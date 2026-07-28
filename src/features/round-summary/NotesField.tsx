import { useEffect, useRef, useState } from 'react'
import { updateRoundNotes } from '@/db/roundsRepo'

interface NotesFieldProps {
  roundId: string
  initialNotes: string
}

/**
 * Free-text notes (conditions, playing partners, weather). Auto-saves after a
 * short debounce and on blur. Seeded once from the round; local state owns the
 * value thereafter so typing isn't clobbered by live-query re-renders.
 */
export function NotesField({ roundId, initialNotes }: NotesFieldProps) {
  const [value, setValue] = useState(initialNotes)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Persist debounced; flush any pending save on unmount.
  useEffect(() => {
    return () => clearTimeout(timer.current)
  }, [])

  function handleChange(next: string) {
    setValue(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void updateRoundNotes(roundId, next)
    }, 600)
  }

  function handleBlur() {
    clearTimeout(timer.current)
    void updateRoundNotes(roundId, value)
  }

  return (
    <div>
      <label htmlFor="round-notes" className="mb-1.5 block text-sm font-semibold text-slate-600">
        Notes
      </label>
      <textarea
        id="round-notes"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={3}
        placeholder="Course conditions, playing partners, weather…"
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-base shadow-sm outline-none placeholder:text-slate-500 focus:border-fairway-500 focus:ring-2 focus:ring-fairway-500/30"
      />
    </div>
  )
}
