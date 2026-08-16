import { test, expect, type Page } from '@playwright/test'
import { seedRound } from './fixtures/rounds'

/**
 * End-to-end coverage for the post-round share flow.
 *
 * The share API is stubbed at the network boundary, so these assert the app's
 * own behaviour: that finishing a round now produces a completion moment rather
 * than ejecting the user to a list, that the sheet previews the SERVER-rendered
 * card, and that the offline case says so honestly instead of spinning.
 */

const ROUND_ID = 'e2e-round-0001'

const SHARE_RESPONSE = {
  shareId: 'testShare123',
  url: 'https://golftrax.app/r/testShare123',
  imageUrl: '/api/share/testShare123/image.png',
  revokeToken: 'test-revoke-token',
}

/** 1x1 PNG so the preview <img> resolves without a real render. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function stubShare(page: Page) {
  const calls: unknown[] = []
  await page.route('**/api/share', async (route) => {
    calls.push(route.request().postDataJSON())
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(SHARE_RESPONSE),
    })
  })
  await page.route('**/api/share/**/image.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }),
  )
  return calls
}

test.describe('Share a finished round', () => {
  test('saving keeps the user on the summary instead of ejecting them to Rounds', async ({
    page,
  }) => {
    await stubShare(page)
    await seedRound(page, { id: ROUND_ID, status: 'draft' })
    await page.goto(`/round/${ROUND_ID}/summary`)

    await page.getByRole('button', { name: 'Save round' }).click()

    // The point of the flow change: the completion moment now exists at all.
    await expect(page.getByText('Round saved')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/round/${ROUND_ID}/summary`))
  })

  test('opening the sheet creates a link and previews the server-rendered card', async ({
    page,
  }) => {
    const calls = await stubShare(page)
    await seedRound(page, { id: ROUND_ID, status: 'complete' })
    await page.goto(`/round/${ROUND_ID}/summary`)

    await page.getByRole('button', { name: 'Share', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Share this round' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByAltText('Your round card')).toBeVisible()
    expect(calls).toHaveLength(1)
  })

  test('the shared payload carries no identifiers', async ({ page }) => {
    const calls = await stubShare(page)
    await seedRound(page, { id: ROUND_ID, status: 'complete' })
    await page.goto(`/round/${ROUND_ID}/summary`)

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Share this round' })).toBeVisible()

    const body = JSON.stringify(calls[0])
    expect(body).not.toContain(ROUND_ID)
    expect(body).not.toContain('test-course')
    expect(body).toContain('pars')
    expect(body).toContain('scores')
  })

  test('re-opening an already-shared round reuses its link', async ({ page }) => {
    // Otherwise every reopen of an old round mints another orphaned share.
    const calls = await stubShare(page)
    await seedRound(page, { id: ROUND_ID, status: 'complete' })
    await page.goto(`/round/${ROUND_ID}/summary`)

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Share this round' })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Share this round' })).toBeVisible()
    expect(calls).toHaveLength(1)
  })

  test('offline says so rather than spinning forever', async ({ page, context }) => {
    await stubShare(page)
    await seedRound(page, { id: ROUND_ID, status: 'complete' })
    await page.goto(`/round/${ROUND_ID}/summary`)
    // Let the page settle first, including the share chunk preload. This is the
    // real scenario — a round is open, then signal drops — and without the wait
    // the test races the preload rather than testing the offline behaviour.
    await page.waitForLoadState('networkidle')

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Share', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Share this round' })
    await expect(dialog.getByText(/You’re offline/)).toBeVisible()
    // The round is safe — the copy must reassure, not alarm.
    await expect(dialog.getByText(/Your round is saved/)).toBeVisible()
  })
})
