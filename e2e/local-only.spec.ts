import { test, expect } from '@playwright/test'
import { playAndSaveRound } from './fixtures/round'

/**
 * The counterpart to `cloud-prompt.sync.spec.ts`: this one runs against the
 * default dev server, which has no `VITE_AUTH0_*` set, so the account surface
 * is compiled out entirely.
 *
 * Saving a round must behave exactly as it did before the cloud prompt existed
 * — that's the promise the whole feature is gated on (PHASE2.md §1, §2), and
 * only a build without Auth0 can prove it.
 */
test.describe('Local-only build', () => {
  test('saving a round never prompts for an account', async ({ page }) => {
    await playAndSaveRound(page)

    await expect(page).toHaveURL(/\/rounds$/)
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('Settings offers no account section', async ({ page }) => {
    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account & sync' })).toBeHidden()
  })
})
