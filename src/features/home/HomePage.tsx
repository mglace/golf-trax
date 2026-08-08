import { Link } from 'react-router-dom'
import { PlusIcon } from '@/components/icons'
import { ResumeDraftCard } from './ResumeDraftCard'

/**
 * Home / landing screen. The "New Round" CTA starts the course-search flow, and
 * any in-progress drafts surface a resume card.
 *
 * The brand mark and "GolfTrax" wordmark used to live in a header here; they're
 * now the persistent {@link AppHeader} rendered once by {@link AppLayout}.
 */
export function HomePage() {
  return (
    <div className="py-6">
      <Link
        to="/new"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-fairway-800 active:bg-fairway-900"
      >
        <PlusIcon className="h-6 w-6" aria-hidden />
        New Round
      </Link>

      <ResumeDraftCard />
    </div>
  )
}
