'use strict'

/**
 * Cosmos DB access for Phase 2 sync (PHASE2.md §5.1).
 *
 * Two containers, both partitioned by `/userId` so every query/point-read is
 * scoped to a single user and stays cheap on the serverless tier:
 *  - `rounds`  — one document per round (incl. tombstones).
 *  - `profile` — one document per user (`id === userId`).
 *
 * The client is created lazily on first use (not at module load) so importing
 * this file never fails when Cosmos settings are absent — e.g. the existing
 * unauthenticated proxy functions keep working with no Cosmos configured.
 */

const { CosmosClient } = require('@azure/cosmos')

let client
let database

/** Raised when the Cosmos app settings are missing (surfaced as a 500). */
class CosmosConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CosmosConfigError'
  }
}

function getDatabase() {
  if (!database) {
    const endpoint = process.env.COSMOS_ENDPOINT
    const key = process.env.COSMOS_KEY
    const databaseId = process.env.COSMOS_DATABASE || 'golftrax'
    if (!endpoint || !key) {
      throw new CosmosConfigError('COSMOS_ENDPOINT / COSMOS_KEY app settings are not configured')
    }
    client = client || new CosmosClient({ endpoint, key })
    database = client.database(databaseId)
  }
  return database
}

/** The `rounds` container (partition key `/userId`). */
function roundsContainer() {
  return getDatabase().container('rounds')
}

/** The `profile` container (partition key `/userId`). */
function profileContainer() {
  return getDatabase().container('profile')
}

module.exports = { roundsContainer, profileContainer, CosmosConfigError }
