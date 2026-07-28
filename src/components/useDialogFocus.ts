import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Whether an element is a sound target to restore focus to on dialog close:
 * still connected, keyboard-focusable (tabIndex >= 0), and rendered/visible
 * (offsetParent is null for display:none and detached nodes). Excludes hidden
 * sr-only openers like the Settings file input (tabIndex={-1}).
 */
function isRestorable(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.isConnected && el.tabIndex >= 0 && el.offsetParent !== null
}

/**
 * Focus management for modal dialogs / bottom-sheets (WCAG 2.4.3 focus order,
 * 2.1.2 no keyboard trap in the "focus can't escape into the page behind"
 * sense). On open it moves focus into the dialog; while open it keeps Tab /
 * Shift+Tab cycling within the dialog; on close it restores focus to whatever
 * was focused before (typically the control that opened it).
 *
 * Returns a ref to spread onto the dialog's content container.
 */
export function useDialogFocus<T extends HTMLElement>() {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move focus into the dialog: first focusable element, or the container.
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusables.length > 0) {
      focusables[0].focus()
    } else {
      container.setAttribute('tabindex', '-1')
      container.focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === container,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      // Restore focus to the opener only if it's a genuinely focusable, visible
      // element. `document.contains()` alone isn't enough: the Settings import
      // flow opens the dialog via a hidden sr-only, tabIndex={-1} file input,
      // which is still "in the document" but off-screen and un-tabbable —
      // restoring to it would strand keyboard/SR focus. When the opener isn't a
      // sound target we leave focus alone; the browser then moves it to <body>,
      // so the next Tab restarts from the top rather than from a lost element.
      if (isRestorable(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [])

  return containerRef
}
