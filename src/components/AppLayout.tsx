import { Outlet, useMatches } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'
import { SyncManager } from '@/sync/SyncManager'

/**
 * Route `handle` shape for the three tab routes (see `src/router.tsx`),
 * carrying the muted label the persistent {@link AppHeader} shows after its
 * hairline divider (`undefined` on Home, where the wordmark is the title).
 * Every other route nested under this layout (course search, round setup) has
 * no `handle` at all and renders its own back-chevron header instead;
 * `/settings` has no header of its own — it relies on the bottom nav to leave.
 */
interface TabHandle {
  screen?: string
}

function isTabHandle(handle: unknown): handle is TabHandle {
  return typeof handle === 'object' && handle !== null
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
 *
 * Whether a route is "tabbed" is read off the matched route's `handle`
 * (set in `src/router.tsx`) rather than compared against the URL directly, so
 * this stays correct under React Router's own matching rules — including the
 * trailing-slash and case-insensitive matching a plain pathname string
 * comparison would otherwise have to reimplement — and can't drift from the
 * route table.
 */
export function AppLayout() {
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const handle = leaf && isTabHandle(leaf.handle) ? leaf.handle : undefined
  const tabbed = handle !== undefined

  return (
    <div className="app-shell flex flex-col overflow-hidden">
      <SyncManager />
      {tabbed && <AppHeader screen={handle.screen} />}
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
