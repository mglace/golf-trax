import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

/**
 * Mobile-first app shell: a scrollable content area with a fixed bottom tab
 * bar. Content is constrained to a phone-width column and centered so the app
 * still looks intentional on larger screens.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <main className="pt-safe mx-auto w-full max-w-md flex-1 px-4 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
