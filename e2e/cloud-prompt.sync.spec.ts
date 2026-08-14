import { test, expect } from '@playwright/test'
import { playAndSaveRound } from './fixtures/round'
import { AUTH0_TEST_DOMAIN, stubAuth0 } from './fixtures/auth0'

/**
 * End-to-end coverage for the post-save "save your rounds to the cloud?" prompt.
 *
 * Runs against the sync-enabled dev server (see the `chromium-sync` project),
 * because the whole account surface is compiled out when `VITE_AUTH0_*` is
 * unset. The Auth0 tenant is stubbed at the network boundary, so nothing here
 * reaches a real issuer — these assert the app's own cadence and hand-off.
 *
 * This is also the first e2e coverage of the round-save flow itself; the walk
 * from search to save lives in `fixtures/round.ts`.
 */

test.describe('Cloud prompt after saving a round', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth0(page)
  })

  test('offers the account after the first round is saved', async ({ page }) => {
    await playAndSaveRound(page)

    const dialog = page.getByRole('dialog', { name: 'Save your rounds to the cloud?' })
    await expect(dialog).toBeVisible()
    // The pitch names the round the user just saved.
    await expect(dialog.getByText(/reach your round from any device/)).toBeVisible()
    // …and is honest that declining costs nothing.
    await expect(
      dialog.getByText(/keep using GolfTrax without an account/),
    ).toBeVisible()
    // The first ask has no "Don't ask again" — it's a plain yes / not-now.
    await expect(dialog.getByRole('button', { name: 'Don’t ask again' })).toBeHidden()
  })

  test('"Not now" dismisses and carries on to the round list', async ({ page }) => {
    await playAndSaveRound(page)

    await page.getByRole('button', { name: 'Not now' }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page).toHaveURL(/\/rounds$/)
  })

  test('does not re-ask on the very next round', async ({ page }) => {
    await playAndSaveRound(page)
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page).toHaveURL(/\/rounds$/)

    // Second round → count is 2, not a milestone.
    await playAndSaveRound(page)

    await expect(page).toHaveURL(/\/rounds$/)
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('asks again at the next milestone, now with an opt-out', async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      await playAndSaveRound(page)
      if (i === 0) await page.getByRole('button', { name: 'Not now' }).click()
      await expect(page).toHaveURL(/\/rounds$/)
    }

    // Third round → the second milestone.
    await playAndSaveRound(page)

    const dialog = page.getByRole('dialog', { name: 'Save your rounds to the cloud?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/reach your 3 rounds from any device/)).toBeVisible()
    // A repeat ask earns the permanent escape hatch.
    await expect(dialog.getByRole('button', { name: 'Don’t ask again' })).toBeVisible()
  })

  test('rejects a malformed email without leaving the app', async ({ page }) => {
    await playAndSaveRound(page)

    await page.getByLabel('Email address').fill('not-an-email')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.')
    await expect(page.getByRole('dialog')).toBeVisible()
    // The error is announced *and* wired to the field for screen readers.
    await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true')
  })

  test('rejects an empty email rather than redirecting', async ({ page }) => {
    await playAndSaveRound(page)

    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.')
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('hands a valid email to Auth0 as a login hint', async ({ page }) => {
    await playAndSaveRound(page)

    // Capture the authorize redirect instead of following it — the fake tenant
    // has no login page to land on.
    const authorize = page.waitForRequest((req) =>
      req.url().startsWith(`https://${AUTH0_TEST_DOMAIN}/authorize`),
    )

    await page.getByLabel('Email address').fill('golfer@example.com')
    await page.getByRole('button', { name: 'Continue' }).click()

    const url = new URL((await authorize).url())
    // The address typed in-app is carried over, so Auth0's screen opens
    // pre-filled and targets the passwordless email connection directly.
    expect(url.searchParams.get('login_hint')).toBe('golfer@example.com')
    expect(url.searchParams.get('connection')).toBe('email')
  })
})
