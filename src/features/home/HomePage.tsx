import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlusIcon } from '@/components/icons'
import { hasAnyRound } from '@/db/roundsRepo'
import { ResumeDraftCard } from './ResumeDraftCard'
import { HowItWorks } from './HowItWorks'
import { SignedInBanner } from './SignedInBanner'

/**
 * Home / landing screen. The "New Round" CTA starts the course-search flow, and
 * any in-progress drafts surface a resume card.
 *
 * When the round library is empty, the screen also shows a short tagline and a
 * "how it works" primer so the app explains itself; both drop away as soon as
 * there's any round on the device, keeping the populated view lean. This keys
 * off an empty library rather than a once-ever first-run flag, so the primer
 * also returns whenever Home is empty again (e.g. after every round is cleared,
 * or after signing out on a shared device) — which is exactly the "here's how
 * this works" state we want to explain.
 *
 * The brand mark and "GolfTrax" wordmark used to live in a header here; they're
 * now the persistent {@link AppHeader} rendered once by {@link AppLayout}.
 */
export function HomePage() {
  // `undefined` while the check loads; only a *confirmed* empty result shows the
  // primer, so it never flashes for someone who already has rounds.
  const hasRounds = useLiveQuery(() => hasAnyRound(), [], undefined)
  const libraryEmpty = hasRounds === false

  return (
    <div className="py-6">
      <SignedInBanner />

      {libraryEmpty && (
        <div className="mb-6 text-center">
          <p className="text-xl font-bold tracking-tight text-slate-900">
            Your pocket scorecard.
          </p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
            Log rounds, track fairways and greens, and watch your game improve — even offline.
          </p>
        </div>
      )}

      <Link
        to="/new"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-fairway-800 active:bg-fairway-900"
      >
        <PlusIcon className="h-6 w-6" aria-hidden />
        New Round
      </Link>

      <ResumeDraftCard />

      {libraryEmpty && <HowItWorks />}
    </div>
  )
}
