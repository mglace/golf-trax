import { test, expect } from '@playwright/test'
import {
  stubSearch,
  stubCourseDetail,
  SAMPLE_RESULTS,
  PEBBLE_BEACH_DETAIL,
} from './fixtures/courses'

/**
 * End-to-end coverage for the course-search flow (the "New round" screen).
 *
 * Every test stubs the course API at the network boundary, so these assert the
 * app's own behaviour — debouncing, min-length gating, loading/empty/error
 * states, and result rendering — without depending on the live GolfCourseAPI.
 */
test.describe('Course search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/new')
  })

  test('shows the idle prompt before any query is entered', async ({ page }) => {
    await expect(page.getByPlaceholder('Search courses by name or city')).toBeVisible()
    await expect(
      page.getByText('Search for a course by name or city to get started.'),
    ).toBeVisible()
  })

  test('does not search for queries shorter than two characters', async ({ page }) => {
    const queries = await stubSearch(page)

    await page.getByRole('searchbox', { name: 'Search courses' }).fill('a')

    // Give the debounce window time to (not) fire, then assert nothing was sent.
    await page.waitForTimeout(600)
    expect(queries).toHaveLength(0)
    await expect(
      page.getByText('Search for a course by name or city to get started.'),
    ).toBeVisible()
  })

  test('renders results for a matching query', async ({ page }) => {
    await stubSearch(page, { courses: SAMPLE_RESULTS })

    await page.getByRole('searchbox', { name: 'Search courses' }).fill('pebble')

    await expect(page.getByText('Pebble Beach Golf Links — Pebble Beach')).toBeVisible()
    await expect(page.getByText('Spyglass Hill Golf Course — Spyglass Hill')).toBeVisible()
    await expect(page.getByText('2 results')).toBeVisible()
  })

  test('shows a loading indicator while the request is in flight', async ({ page }) => {
    await stubSearch(page, { courses: SAMPLE_RESULTS, delayMs: 800 })

    await page.getByRole('searchbox', { name: 'Search courses' }).fill('pebble')

    // The spinner carries an accessible "Searching" label while loading…
    await expect(page.getByLabel('Searching')).toBeVisible()
    // …and is replaced by results once the response arrives.
    await expect(page.getByText('Pebble Beach Golf Links — Pebble Beach')).toBeVisible()
    await expect(page.getByLabel('Searching')).toBeHidden()
  })

  test('shows the empty state when nothing matches', async ({ page }) => {
    await stubSearch(page, { courses: [] })

    await page.getByRole('searchbox', { name: 'Search courses' }).fill('zzzzz')

    await expect(page.getByText('No courses found')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add this course manually' })).toBeVisible()
  })

  test('surfaces an API error and recovers on retry', async ({ page }) => {
    // First attempt fails (500); after tapping retry, the endpoint succeeds.
    let attempt = 0
    await page.route(/\/search\?/, async (route) => {
      attempt += 1
      if (attempt === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ courses: SAMPLE_RESULTS }),
      })
    })

    await page.getByRole('searchbox', { name: 'Search courses' }).fill('pebble')

    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('GolfCourseAPI is having trouble')

    await alert.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByText('Pebble Beach Golf Links — Pebble Beach')).toBeVisible()
    expect(attempt).toBe(2)
  })

  test('clears the query and returns to the idle prompt', async ({ page }) => {
    await stubSearch(page, { courses: SAMPLE_RESULTS })
    const box = page.getByRole('searchbox', { name: 'Search courses' })

    await box.fill('pebble')
    await expect(page.getByText('Pebble Beach Golf Links — Pebble Beach')).toBeVisible()

    await page.getByRole('button', { name: 'Clear search' }).click()

    await expect(box).toHaveValue('')
    await expect(
      page.getByText('Search for a course by name or city to get started.'),
    ).toBeVisible()
  })

  test('debounces rapid typing into a single request for the final query', async ({ page }) => {
    const queries = await stubSearch(page, { courses: SAMPLE_RESULTS })

    // Type character-by-character faster than the 350ms debounce window.
    await page
      .getByRole('searchbox', { name: 'Search courses' })
      .pressSequentially('pebble', { delay: 40 })

    await expect(page.getByText('Pebble Beach Golf Links — Pebble Beach')).toBeVisible()

    // Only the settled query is ever sent — earlier keystrokes are cancelled.
    expect(queries).toEqual(['pebble'])
  })

  test('selecting a result routes to course setup', async ({ page }) => {
    await stubSearch(page, { courses: SAMPLE_RESULTS })
    await stubCourseDetail(page, PEBBLE_BEACH_DETAIL)

    await page.getByRole('searchbox', { name: 'Search courses' }).fill('pebble')
    await page.getByRole('button', { name: /Pebble Beach Golf Links/ }).click()

    await expect(page).toHaveURL(/\/new\/101$/)
  })
})

/**
 * Offline handling: the app proactively warns that search needs a connection
 * rather than waiting for a request to fail.
 */
test.describe('Course search — offline', () => {
  test('warns the user when the browser goes offline', async ({ page, context }) => {
    await page.goto('/new')
    // No banner while connected…
    await expect(page.getByText(/You’re offline\./)).toBeHidden()

    // …then dropping the connection surfaces it reactively (offline event).
    await context.setOffline(true)
    await expect(page.getByText(/You’re offline\./)).toBeVisible()
  })
})
