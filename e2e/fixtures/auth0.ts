import type { Page } from '@playwright/test'

/**
 * The fake Auth0 tenant the sync-enabled dev server is built against.
 *
 * Lives here rather than in `playwright.config.ts` so specs don't have to import
 * the config to reach it — that would execute the whole config module (browser
 * path probing included) inside every test worker, and couples specs to build
 * configuration they otherwise have no reason to know about. Both the config and
 * the specs import this instead.
 *
 * Deliberately not a real domain: every test stubs it at the network boundary,
 * so no test can reach a live issuer.
 */
export const AUTH0_TEST_DOMAIN = 'auth.example.test'

/**
 * Swallow every call to the fake tenant. Auth0's SDK probes the issuer on mount,
 * so without this the app stalls on unroutable requests.
 */
export async function stubAuth0(page: Page): Promise<void> {
  await page.route(`https://${AUTH0_TEST_DOMAIN}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}
