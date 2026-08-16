/**
 * Client for the app's own share endpoints.
 *
 * Unlike `syncClient.ts` this sends NO auth header — `/api/share` is anonymous
 * by design, because requiring an account would remove most of the funnel the
 * share feature exists to create. (In particular, do not add
 * `X-GolfTrax-Authorization` here; that is only for the sync endpoints.)
 *
 * Errors follow the `golfCourseApi.ts` shape: a typed `kind` the UI can map to
 * copy, rather than a raw status the caller has to interpret.
 */
import type { ShareCardSnapshot } from '@/domain/shareCard'

export type ShareErrorKind = 'offline' | 'rate-limited' | 'rejected' | 'server' | 'unknown'

export class ShareError extends Error {
  kind: ShareErrorKind
  constructor(kind: ShareErrorKind, message: string) {
    super(message)
    this.name = 'ShareError'
    this.kind = kind
  }
}

export interface CreatedShare {
  shareId: string
  url: string
  imageUrl: string
  revokeToken: string
}

function errorForStatus(status: number, serverMessage?: string): ShareError {
  if (status === 429) {
    return new ShareError('rate-limited', 'Too many shares right now. Try again in a little while.')
  }
  if (status === 400) {
    // The server rejected the payload — a client bug, not something the user
    // can fix by retrying, so say so rather than offering a retry.
    return new ShareError('rejected', serverMessage || 'This round can’t be shared.')
  }
  if (status >= 500) {
    return new ShareError('server', 'Sharing is temporarily unavailable. Try again shortly.')
  }
  return new ShareError('unknown', 'Something went wrong creating the link.')
}

/** Publish a round's card and get back its public link. */
export async function createShare(snapshot: ShareCardSnapshot): Promise<CreatedShare> {
  let res: Response
  try {
    res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
  } catch {
    // fetch() only rejects on network-layer failures, which for this feature
    // almost always means the phone is on a course with no signal.
    throw new ShareError('offline', 'You’re offline. Your round is saved — share it when you reconnect.')
  }

  if (!res.ok) {
    let serverMessage: string | undefined
    try {
      serverMessage = ((await res.json()) as { error?: string }).error
    } catch {
      // Body wasn't JSON; the status alone determines the message.
    }
    throw errorForStatus(res.status, serverMessage)
  }

  try {
    return (await res.json()) as CreatedShare
  } catch {
    throw new ShareError('unknown', 'The server returned an unexpected response.')
  }
}

/**
 * Take a shared link down. Best-effort: the local record is dropped by the
 * caller regardless, since a link we can no longer name is worse than one that
 * lingers.
 */
export async function revokeShare(shareId: string, revokeToken: string): Promise<void> {
  const res = await fetch(`/api/share/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
    headers: { 'X-GolfTrax-Revoke-Token': revokeToken },
  })
  if (!res.ok && res.status !== 404) throw errorForStatus(res.status)
}
