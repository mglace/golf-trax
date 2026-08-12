import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PlusIcon } from '@/components/icons'
import { hasAnyRound } from '@/db/roundsRepo'
import { ResumeDraftCard } from './ResumeDraftCard'
import { HowItWorks } from './HowItWorks'

/**
 * Home / landing screen. The "New Round" CTA starts the course-search flow, and
 * any in-progress drafts surface a resume card.
 *
 * First-time visitors (an empty round library) also get a short tagline and a
 * "how it works" primer so the app explains itself; both drop away once the
 * player has any round on the device, keeping the returning-user view lean.
 *
 * The brand mark and "GolfTrax" wordmark used to live in a header here; they're
 * now the persistent {@link AppHeader} rendered once by {@link AppLayout}.
 */
export function HomePage() {
  // `undefined` while the check loads; only treat a *confirmed* empty library as
  // a new user so the onboarding never flashes for someone with rounds.
  const hasRounds = useLiveQuery(() => hasAnyRound(), [], undefined)
  const isNewUser = hasRounds === false

  return (
    <div className="py-6">
      {isNewUser && (
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

      {isNewUser && <HowItWorks />}
    </div>
  )
}
