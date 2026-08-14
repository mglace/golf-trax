import { expect, type Page } from '@playwright/test'
import { stubCourseDetail, stubSearch, PEBBLE_BEACH_DETAIL, SAMPLE_RESULTS } from './courses'

/**
 * Drive the real UI from Home to a saved round: search → setup → entry →
 * summary → Save. Goes through the app rather than seeding IndexedDB so the
 * flow under test is the one a player actually walks.
 *
 * Scores are deliberately left blank — saving a partially-scored round is a
 * supported path (the amber banner on the summary), and entering 9 or 18 holes
 * would add minutes to every test for nothing this suite asserts on.
 */
export async function playAndSaveRound(page: Page): Promise<void> {
  await stubSearch(page, { courses: SAMPLE_RESULTS })
  await stubCourseDetail(page, PEBBLE_BEACH_DETAIL)

  await page.goto('/new')
  await page.getByRole('searchbox', { name: 'Search courses' }).fill('pebble')
  await page.getByText('Pebble Beach Golf Links — Pebble Beach').click()

  // Course setup: pick the only tee, then the shortest round.
  await expect(page.getByRole('heading', { name: 'Round setup' })).toBeVisible()
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Front 9' }).click()
  await page.getByRole('button', { name: 'Start round' }).click()

  // Hole entry → summary → save.
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('heading', { name: 'Round summary' })).toBeVisible()
  await page.getByRole('button', { name: 'Save round' }).click()
}
