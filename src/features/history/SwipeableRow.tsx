import { useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { TrashIcon } from '@/components/icons'

interface SwipeableRowProps {
  children: ReactNode
  /** Accessible label for the tappable navigation area. */
  tapLabel: string
  onTap: () => void
  onDelete: () => void
}

const REVEAL = 88 // px of delete action revealed behind the card

/**
 * A row that navigates on tap/Enter and reveals a Delete action on left-swipe
 * (touch). Navigation is a focusable role="button" (keyboard accessible); an
 * always-present trash button is the accessible delete path, with the swipe
 * reveal as a touch shortcut.
 */
export function SwipeableRow({ children, tapLabel, onTap, onDelete }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)

  const startX = useRef(0)
  const startOffset = useRef(0)
  const moved = useRef(false)

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    startX.current = e.clientX
    startOffset.current = offset
    moved.current = false
    setDragging(true)
    // NOTE: do NOT capture here — capturing on down redirects the click to this
    // element and breaks tap-to-navigate. Capture only once a drag is detected.
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - startX.current
    if (!moved.current && Math.abs(dx) > 4) {
      moved.current = true
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    }
    if (moved.current) {
      setOffset(Math.max(-REVEAL, Math.min(0, startOffset.current + dx)))
    }
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (moved.current) {
      // Snap open or closed; the ensuing click is suppressed via moved flag.
      if (offset < -REVEAL / 2) {
        setOpen(true)
        setOffset(-REVEAL)
      } else {
        setOpen(false)
        setOffset(0)
      }
    }
  }

  function handleNav() {
    if (moved.current) {
      moved.current = false // was a drag, not a tap
      return
    }
    if (open) {
      setOpen(false)
      setOffset(0)
      return
    }
    onTap()
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete action revealed on swipe (touch shortcut; not a keyboard target). */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          type="button"
          onClick={onDelete}
          tabIndex={-1}
          aria-hidden
          className="flex w-[88px] flex-col items-center justify-center gap-1 bg-red-600 text-xs font-semibold text-white"
        >
          <TrashIcon className="h-5 w-5" aria-hidden />
          Delete
        </button>
      </div>

      {/* Card face. */}
      <div
        className="relative flex touch-pan-y items-stretch bg-white"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 180ms ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={tapLabel}
          onClick={handleNav}
          onKeyDown={handleKey}
          className="min-w-0 flex-1 cursor-pointer rounded-l-xl outline-none focus-visible:ring-2 focus-visible:ring-fairway-500/50"
        >
          {children}
        </div>
        <button
          type="button"
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Delete ${tapLabel}`}
          className="flex shrink-0 items-center rounded-r-xl border-y border-r border-slate-200 bg-white px-3 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <TrashIcon className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
