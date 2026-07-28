import { Link } from 'react-router-dom'
import { PlusIcon, FlagIcon } from '@/components/icons'
import { ResumeDraftCard } from './ResumeDraftCard'

/**
 * Home / landing screen. The "New Round" CTA starts the course-search flow, and
 * any in-progress drafts surface a resume card.
 */
export function HomePage() {
  return (
    <div className="py-6">
      <header className="mb-6 flex items-center gap-2">
        <FlagIcon className="h-7 w-7 text-fairway-700" aria-hidden />
        <h1 className="text-2xl font-bold tracking-tight">GolfTrax</h1>
      </header>

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
