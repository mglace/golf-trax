'use strict'

/**
 * Remove share documents created from preview/staging environments.
 *
 * SWA staging environments inherit the production app settings, so shares
 * created while testing a PR land in the production container with links
 * pointing at hosts that die when the PR closes. This finds those and (only
 * when told to) deletes them.
 *
 * DRY RUN BY DEFAULT. It prints what it would delete and exits. Deleting
 * requires `--delete`, because the cost of a mistake here is a real user's
 * share, and nobody should be one typo away from that.
 *
 * Usage, from the repo root:
 *
 *   set COSMOS_ENDPOINT=https://golftrax-cosmos.documents.azure.com:443/
 *   set COSMOS_KEY=<primary-key>
 *   node api/scripts/purge-preview-shares.js            # list only
 *   node api/scripts/purge-preview-shares.js --delete   # actually remove
 *
 * PowerShell uses `$env:COSMOS_ENDPOINT = '...'` instead of `set`.
 *
 * Optional: PRODUCTION_ORIGINS as a comma-separated list, if the app is served
 * from more than one hostname. Anything NOT in that list counts as a preview.
 */

const { CosmosClient } = require('@azure/cosmos')
const { isPreviewShare, DEFAULT_PRODUCTION_ORIGINS } = require('../src/share-purge')

const DELETE = process.argv.includes('--delete')

const productionOrigins = process.env.PRODUCTION_ORIGINS
  ? process.env.PRODUCTION_ORIGINS.split(',').map((s) => s.trim())
  : DEFAULT_PRODUCTION_ORIGINS

async function main() {
  const endpoint = process.env.COSMOS_ENDPOINT
  const key = process.env.COSMOS_KEY
  if (!endpoint || !key) {
    console.error('Set COSMOS_ENDPOINT and COSMOS_KEY first.')
    process.exit(1)
  }

  const container = new CosmosClient({ endpoint, key })
    .database(process.env.COSMOS_DATABASE || 'golftrax')
    .container('shares')

  // Fetch shares only, then filter with the tested predicate rather than
  // trusting a hand-written WHERE clause to decide what gets destroyed.
  const { resources } = await container.items
    .query({ query: "SELECT * FROM c WHERE c.type = 'share'" })
    .fetchAll()

  const doomed = resources.filter((doc) => isPreviewShare(doc, productionOrigins))
  const kept = resources.length - doomed.length

  console.log(`Production origins : ${productionOrigins.join(', ')}`)
  console.log(`Shares in container: ${resources.length}`)
  console.log(`Keeping            : ${kept}`)
  console.log(`Preview shares     : ${doomed.length}`)
  console.log('')

  for (const doc of doomed) {
    console.log(`  ${doc.id}  ${doc.createdAt || '(no date)'}  ${doc.origin}`)
  }

  if (doomed.length === 0) {
    console.log('\nNothing to remove.')
    return
  }

  if (!DELETE) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --delete to remove these.')
    return
  }

  let removed = 0
  for (const doc of doomed) {
    try {
      await container.item(doc.id, doc.id).delete()
      removed += 1
    } catch (err) {
      // Keep going: one failure shouldn't strand the rest half-cleaned.
      console.error(`  failed to delete ${doc.id}: ${err.message}`)
    }
  }
  console.log(`\nDeleted ${removed} of ${doomed.length}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
