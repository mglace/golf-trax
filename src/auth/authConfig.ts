/**
 * Auth0 configuration for optional Phase 2 sync (PHASE2.md §4).
 *
 * Sync is enabled only when all three public Auth0 values are present at build
 * time. With any of them missing, {@link syncConfig} is null and the entire
 * account/sync surface is inert — the app runs exactly like the local-only MVP
 * (PHASE2.md §1, §2). These are public values (a passwordless SPA has no
 * client secret), safe to inline in the bundle.
 */

export interface SyncConfig {
  domain: string
  clientId: string
  audience: string
}

function readConfig(): SyncConfig | null {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE
  if (!domain || !clientId || !audience) return null
  return { domain, clientId, audience }
}

/** Non-null iff sync is configured for this build. */
export const syncConfig: SyncConfig | null = readConfig()

/** Whether optional account sync is available in this build. */
export const isSyncConfigured = syncConfig !== null
