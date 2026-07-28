/**
 * Small store for user-facing sync status (PHASE2.md §7). Kept separate from the
 * engine so any component (Settings today) can subscribe without importing the
 * Dexie/network code.
 */
import { create } from 'zustand'

export type SyncStatus =
  | 'signed-out' // configured but not signed in
  | 'syncing'
  | 'synced'
  | 'offline' // no connectivity; will sync later
  | 'paused' // signed in but no valid token (expired offline)
  | 'error'

interface SyncStore {
  status: SyncStatus
  /** ms-epoch of the last successful sync, or null. */
  lastSyncedAt: number | null
  setStatus: (status: SyncStatus) => void
  markSynced: (at: number) => void
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'signed-out',
  lastSyncedAt: null,
  setStatus: (status) => set({ status }),
  markSynced: (at) => set({ status: 'synced', lastSyncedAt: at }),
}))
