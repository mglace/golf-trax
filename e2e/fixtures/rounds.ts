import type { Page } from '@playwright/test'

/**
 * Seed a round straight into IndexedDB.
 *
 * Driving the full search → setup → 18-hole entry UI just to reach the summary
 * screen would make these tests slow and couple them to flows they aren't
 * testing. The app must already be loaded once so Dexie has created the schema;
 * we then write through a raw IndexedDB transaction and reload.
 */
export async function seedRound(
  page: Page,
  opts: { id: string; status: 'draft' | 'complete'; holeCount?: 9 | 18 },
) {
  const holeCount = opts.holeCount ?? 9
  await page.goto('/')
  // Wait for Dexie to have opened and upgraded the database.
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases()
    return dbs.some((d) => d.name === 'golftrax')
  })

  await page.evaluate(
    ({ id, status, holeCount }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('golftrax')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('rounds', 'readwrite')
          const pars = [4, 5, 3, 4, 4, 3, 5, 4, 4].slice(0, holeCount)
          tx.objectStore('rounds').put({
            id,
            courseId: 'test-course',
            courseName: 'Pine Ridge Golf Club',
            clubName: 'Pine Ridge Golf Club',
            gender: 'male',
            teeName: 'White',
            roundLength: holeCount === 18 ? '18' : 'front9',
            status,
            date: new Date('2026-08-15T12:00:00.000Z').toISOString(),
            updatedAt: new Date('2026-08-15T12:00:00.000Z').toISOString(),
            dirty: 0,
            owner: 'local',
            // Every hole scored, so the round is shareable.
            holes: pars.map((par, i) => ({
              holeNumber: i + 1,
              par,
              handicap: i + 1,
              yardage: 350,
              score: par + 1,
              putts: 2,
              gir: false,
            })),
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    { id: opts.id, status: opts.status, holeCount },
  )
}
