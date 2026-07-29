import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SyncManager } from '@/sync/SyncManager'

/**
 * Mobile-first app shell: a scrollable content area above a bottom tab bar.
 * The shell fills the dynamic viewport (`app-shell`) and lays out as a flex
 * column so the nav is a normal in-flow child pinned to the true bottom edge —
 * this keeps the bar on the bottom in installed PWAs, where `position: fixed`
 * anchors above the home indicator on iOS. Content scrolls inside `main` and is
 * constrained to a phone-width column so the app looks intentional on larger
 * screens.
 */
export function AppLayout() {
  return (
    <div className="app-shell flex flex-col overflow-hidden">
      <SyncManager />
      <main className="pt-safe mx-auto w-full max-w-md flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
