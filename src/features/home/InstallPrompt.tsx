import { useState } from 'react'
import type { ReactNode } from 'react'
import { MoreIcon, ShareIcon, XIcon } from '@/components/icons'
import {
  browserInstallEnv,
  readInstallPromptDismissed,
  shouldShowInstallPrompt,
  writeInstallPromptDismissed,
} from '@/pwa/installPrompt'

/**
 * iOS-only "Add to Home Screen" card on the Home screen (see
 * `pwa/installPrompt.ts` for why it exists and who sees it).
 *
 * It lives on Home rather than as a global overlay so it never competes with
 * the on-course round-entry flow, and it is a card in the page flow rather than
 * a fixed bar so it can't cover the bottom nav. Dismissal is remembered on the
 * device; installing hides it on its own, since the installed app launches in
 * standalone mode.
 */
export function InstallPrompt() {
  // Computed once on mount: neither the platform nor the display mode changes
  // while a page is open.
  const [visible, setVisible] = useState(() =>
    shouldShowInstallPrompt(browserInstallEnv(), readInstallPromptDismissed()),
  )

  if (!visible) return null

  const dismiss = () => {
    writeInstallPromptDismissed()
    setVisible(false)
  }

  return (
    <section
      aria-labelledby="install-heading"
      className="relative mt-6 rounded-xl border border-fairway-200 bg-fairway-50/60 p-4 pr-10 shadow-sm"
    >
      <h2 id="install-heading" className="font-semibold text-slate-900">
        Add GolfTrax to your Home Screen
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        It opens full screen, works offline on the course, and keeps your rounds saved on this
        phone.
      </p>
      {/*
        Newer Safari's compact bottom bar has no Share button — it lives in the
        "•••" menu — while older iOS and the full toolbar show it directly. Lead
        with the ••• path and note the shortcut, so both layouts are covered.
      */}
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
        <li>
          Tap <Chip icon={<MoreIcon className="h-4 w-4 text-slate-600" aria-hidden />} srLabel="More" />{' '}
          then <Chip icon={<ShareIcon className="h-4 w-4 text-sky-600" aria-hidden />} label="Share" />
          <span className="text-slate-500"> (or Share right in the toolbar, if you see it)</span>
        </li>
        <li>
          Scroll down and tap <span className="font-medium">Add to Home Screen.</span>
        </li>
      </ol>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install tip"
        className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-fairway-100 hover:text-slate-600"
      >
        <XIcon className="h-5 w-5" aria-hidden />
      </button>
    </section>
  )
}

/** Inline stand-in for a Safari button, so the steps match what's on screen. */
function Chip({ icon, label, srLabel }: { icon: ReactNode; label?: string; srLabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 align-middle font-medium ring-1 ring-slate-200">
      {icon}
      {label}
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </span>
  )
}
