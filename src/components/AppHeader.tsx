import { Link } from 'react-router-dom'
import { FlagIcon, SettingsIcon } from './icons'

interface AppHeaderProps {
  /** Muted label shown after a hairline divider, e.g. "Rounds" or "Stats". Omit on Home, where the wordmark is the title. */
  screen?: string
}

/**
 * The persistent app bar. Rendered once by {@link AppLayout}, above the
 * scrolling content, so the mark and wordmark never move between the Home,
 * Rounds and Stats tabs — `screen` names where you are. Full-bleed background
 * and hairline; the inner row is capped to the same phone-width column as the
 * content so the mark and gear line up with it.
 *
 * Focused flows (course search, round setup, round entry, round summary)
 * render their own back-chevron header instead and never show this bar.
 */
export function AppHeader({ screen }: AppHeaderProps) {
  return (
    <header className="pt-safe shrink-0 border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-4">
        <FlagIcon className="h-6 w-6 shrink-0 text-fairway-700" aria-hidden />
        <span className="text-lg font-bold tracking-tight">GolfTrax</span>
        {screen && (
          <>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-slate-200" />
            <span className="text-sm font-medium text-slate-500">{screen}</span>
          </>
        )}
        <Link
          to="/settings"
          aria-label="Settings"
          className="ml-auto -mr-2.5 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
        >
          <SettingsIcon className="h-[22px] w-[22px]" aria-hidden />
        </Link>
      </div>
    </header>
  )
}
