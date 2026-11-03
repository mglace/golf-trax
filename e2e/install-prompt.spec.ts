import { test, expect } from '@playwright/test'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

const HEADING = 'Add GolfTrax to your Home Screen'

/**
 * The iOS "Add to Home Screen" tip. Chromium stands in for Safari here: the
 * decision only reads the user agent and display mode, so a spoofed iPhone UA
 * exercises the same path.
 */
test.describe('iOS install prompt', () => {
  test('is not shown on Android', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'New Round' })).toBeVisible()
    await expect(page.getByRole('heading', { name: HEADING })).toBeHidden()
  })

  test.describe('on iPhone', () => {
    test.use({ userAgent: IPHONE_SAFARI })

    test('shows on Home and stays dismissed after a reload', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: HEADING })).toBeVisible()

      await page.getByRole('button', { name: 'Dismiss install tip' }).click()
      await expect(page.getByRole('heading', { name: HEADING })).toBeHidden()

      await page.reload()
      await expect(page.getByRole('link', { name: 'New Round' })).toBeVisible()
      await expect(page.getByRole('heading', { name: HEADING })).toBeHidden()
    })
  })
})
