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
    const dialog = page.getByRole('dialog', { name: 'Share this round' })
    await expect(dialog).toBeVisible()
    // The dialog opens while the POST is still in flight — the preview is what
    // proves it resolved, so waiting on the dialog alone leaves `calls[0]`
    // undefined about one run in six.
    await expect(dialog.getByAltText('Your round card')).toBeVisible()

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

/** Matches the card image regardless of query string. */
const IMAGE_ROUTE = /\/api\/share\/[^/]+\/image\.png/

/**
 * A broken <img> still satisfies `toBeVisible()` — width/height give it a box
 * either way — so a stub that quietly missed would look like a pass. Decoded
 * pixels are the only assertion that means the card actually rendered.
 */
async function expectCardDecoded(page: Page) {
  const card = page.getByAltText('A shared GolfTrax round card')
  await expect(card).toBeVisible()
  await expect
    .poll(() => card.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
}

/**
 * Opening a share link.
 *
 * In production the backend renders `/r/{shareId}`; the dev server the e2e suite
 * runs against has no functions, so what these exercise is the SPA's own
 * handling of the path — the backstop for the shell being served there anyway,
 * which `NAVIGATION_FALLBACK_DENYLIST` is what prevents. (It does NOT rescue a
 * client still on a pre-denylist service worker: that worker serves its own
 * precached shell, which has no `/r/` route. See SharedRoundPage.)
 */
test.describe('Opening a share link in the app', () => {
  test('shows the shared card and a way into the app', async ({ page }) => {
    await stubShare(page)
    await page.goto('/r/MDUBlwoS_Cb9UOT6E05kkw')

    await expectCardDecoded(page)
    await expect(page.getByRole('link', { name: 'Open GolfTrax' })).toBeVisible()
    await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)

    // The live region must already be in the accessible tree while the card is
    // showing: a region inserted in the same mutation as its text is commonly
    // missed by screen readers. Attached, not visible — it's empty here.
    await expect(page.getByRole('status')).toBeAttached()
  })

  test('a card that will not load hedges instead of asserting a revocation', async ({ page }) => {
    // 404 (revoked) and 500 (render/store failure) are indistinguishable from an
    // <img> error event, so the copy must not claim which one happened.
    await page.route('**/api/share/**/image.png', (route) => route.fulfill({ status: 404 }))
    await page.goto('/r/MDUBlwoS_Cb9UOT6E05kkw')

    await expect(page.getByText(/Couldn’t load this round/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open GolfTrax' })).toBeVisible()
  })

  test('"Try again" re-requests the card and recovers', async ({ page }) => {
    // `attempts` is the point: the button has to produce a SECOND request, not
    // just repaint the failed one.
    let attempts = 0
    await page.route(IMAGE_ROUTE, (route) => {
      attempts += 1
      if (attempts === 1) return route.fulfill({ status: 500 })
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX })
    })
    await page.goto('/r/MDUBlwoS_Cb9UOT6E05kkw')

    await expect(page.getByText(/Couldn’t load this round/)).toBeVisible()
    await page.getByRole('button', { name: 'Try again' }).click()

    await expectCardDecoded(page)
    expect(attempts).toBe(2)
  })

  test('a retry that fails again keeps focus and announces itself', async ({ page }) => {
    // Without this, "Try again" tears down the button the user just pressed and
    // focus lands on <body> — the retry reads as doing nothing to a keyboard or
    // screen-reader user.
    await page.route(IMAGE_ROUTE, (route) => route.fulfill({ status: 404 }))
    await page.goto('/r/MDUBlwoS_Cb9UOT6E05kkw')

    const button = page.getByRole('button', { name: 'Try again' })
    await expect(button).toBeVisible()
    // The message must live in a region a screen reader will announce.
    await expect(page.getByRole('status')).toContainText(/Couldn’t load this round/)

    await button.focus()
    await button.press('Enter')

    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused()
  })

  test('a dropped connection says so rather than blaming the sender', async ({
    page,
    context,
  }) => {
    // Signal has to drop AFTER the document loads: offline from the start would
    // fail the navigation itself, which in production the service worker
    // absorbs but the e2e dev server (no SW) cannot.
    await page.route(IMAGE_ROUTE, (route) => route.abort())
    await page.goto('/r/MDUBlwoS_Cb9UOT6E05kkw')
    await expect(page.getByText(/Couldn’t load this round/)).toBeVisible()

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByText(/You’re offline/)).toBeVisible()
    // The round is still there — the copy must not send the reader away.
    await expect(page.getByText(/no longer be shared/)).toHaveCount(0)
  })
})
