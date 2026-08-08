import { Outlet, useLocation } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'
import { SyncManager } from '@/sync/SyncManager'

/** The three tab routes that get the persistent {@link AppHeader}, and the
 * muted label it shows after the hairline divider (`undefined` on Home, where
 * the wordmark is the title). Every other route nested under this layout
 * (course search, round setup, settings) is a focused flow with its own
 * back-chevron header, and renders no app bar here. */
const TAB_SCREEN_LABEL: Record<string, string | undefined> = {
  '/': undefined,
  '/rounds': 'Rounds',
  '/stats': 'Stats',
}

/**
 * Mobile-first app shell: a persistent app bar and a scrollable content area
 * above a bottom tab bar. The shell fills the dynamic viewport (`app-shell`)
 * and lays out as a flex column so the nav is a normal in-flow child pinned to
 * the true bottom edge — this keeps the bar on the bottom in installed PWAs,
 * where `position: fixed` anchors above the home indicator on iOS. Content
 * scrolls inside `main` and is constrained to a phone-width column so the app
 * looks intentional on larger screens.
 *
 * The top safe-area inset is applied to whichever element is topmost: the
 * persistent {@link AppHeader} on the three tab routes, or `main` itself on
 * focused flows that render their own header below the true top edge.
 */
export function AppLayout() {
  const { pathname } = useLocation()
  // Normalize a trailing slash before the lookup — React Router matches
  // '/rounds/' to the same route as '/rounds', but a plain key lookup would
  // treat them as different paths and silently drop the header.
  const key = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const tabbed = key in TAB_SCREEN_LABEL

  return (
    <div className="app-shell flex flex-col overflow-hidden">
      <SyncManager />
      {tabbed && <AppHeader screen={TAB_SCREEN_LABEL[key]} />}
      <main
        className={[
          'mx-auto w-full max-w-md flex-1 overflow-y-auto overscroll-contain px-4 pb-6',
          tabbed ? '' : 'pt-safe',
        ].join(' ')}
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
