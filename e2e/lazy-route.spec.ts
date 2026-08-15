import { test, expect } from '@playwright/test'

/**
 * Lazy routes are wrapped in a per-route-keyed ErrorBoundary so a failed chunk
 * fetch (a flaky connection before the service worker has precached the chunk)
 * shows a reload prompt instead of a blank screen — and, crucially, that error
 * state must NOT leak across routes: navigating to a healthy lazy route has to
 * recover. Without the per-route key the boundary instance is reused (React
 * Router renders route elements into the Outlet unkeyed), leaving the error
 * screen stuck on a route that loads fine.
 */
test.describe('Lazy route error boundary', () => {
  test('shows a reload prompt on a failed chunk and recovers on another route', async ({
    page,
  }) => {
    // Force the Stats route's chunk to fail to load.
    await page.route(/features\/stats\/StatsPage/, (route) => route.abort())

    await page.goto('/')
    await page.getByRole('link', { name: 'Stats' }).click()

    // The boundary catches the failed import and offers recovery.
    await expect(page.getByText(/This screen/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()

    // Navigating to a healthy lazy route recovers — the error must not persist
    // across routes (regression guard for the keyless-boundary reuse bug).
    await page.getByRole('link', { name: 'Rounds' }).click()
    await expect(page).toHaveURL(/\/rounds$/)
    await expect(page.getByText(/This screen/)).toBeHidden()
  })

  test('the "Go to Home" link recovers client-side without a page reload', async ({
    page,
  }) => {
    await page.route(/features\/stats\/StatsPage/, (route) => route.abort())

    await page.goto('/')
    await page.getByRole('link', { name: 'Stats' }).click()
    await expect(page.getByText(/This screen/)).toBeVisible()

    // "Go to Home" is a client-side navigation to the eager HomePage — it must
    // recover the app in-place (no full document load), which is what makes it
    // safe in the offline first-session case a full reload would strand.
    await page.getByRole('link', { name: 'Go to Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(/This screen/)).toBeHidden()
  })
})
