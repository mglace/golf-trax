import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCourse } from './useCourse'
import { TeeSelect, type SelectedTee } from './TeeSelect'
import { ApiErrorMessage } from '@/components/ApiErrorMessage'
import { ChevronLeftIcon, MapPinIcon, SpinnerIcon } from '@/components/icons'
import { formatCourseName, formatLocation, findTee } from '@/domain/course'
import { availableRoundLengths, ROUND_LENGTH_LABEL } from '@/domain/round'
import { createDraftRound } from '@/db/roundsRepo'
import type { RoundLength } from '@/db/types'
import type { ApiCourse } from '@/api/types'

/**
 * Course setup: pick a tee box and round length, then start the round (creates
 * a draft and navigates into hole entry).
 */
export function CourseSetupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { courseId } = useParams<{ courseId: string }>()
  const id = courseId ? Number(courseId) : undefined
  // The selection flow passes the course it just fetched+cached (tees included)
  // so we can render it directly instead of re-resolving it by id. A plain
  // deep-link carries no navigation state and resolves from cache/API; a refresh
  // replays this same state (history.state survives reloads), which is fine —
  // seedCourse only accepts it when it's for this id and has tee data.
  const preloaded = (location.state as { course?: ApiCourse } | null)?.course
  const { status, course, error, retry } = useCourse(id, preloaded)

  const [tee, setTee] = useState<SelectedTee | null>(null)
  const [roundLength, setRoundLength] = useState<RoundLength | null>(null)
  const [starting, setStarting] = useState(false)

  // Round lengths depend on the selected tee's hole count.
  const selectedTeeBox = course && tee ? findTee(course, tee.gender, tee.teeName) : undefined
  const lengthOptions = selectedTeeBox
    ? availableRoundLengths(selectedTeeBox.number_of_holes)
    : []

  function handleSelectTee(next: SelectedTee) {
    setTee(next)
    // Reset the round length if it's no longer valid for the new tee.
    setRoundLength(null)
  }

  async function handleStart() {
    if (!course || !tee || !roundLength) return
    setStarting(true)
    try {
      const round = await createDraftRound(course, tee.gender, tee.teeName, roundLength)
      navigate(`/round/${round.id}`)
    } catch {
      setStarting(false)
    }
  }

  const canStart = Boolean(tee && roundLength && !starting)

  return (
    <div className="py-4">
      <header className="mb-4 flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeftIcon className="h-6 w-6" aria-hidden />
        </button>
        <h1 className="text-xl font-bold tracking-tight">Round setup</h1>
      </header>

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <SpinnerIcon className="h-6 w-6" aria-hidden />
          <span className="text-sm">Loading course…</span>
        </div>
      )}

      {status === 'error' && error && <ApiErrorMessage error={error} onRetry={retry} />}

      {status === 'success' && course && (
        <>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-900">{formatCourseName(course)}</p>
            {formatLocation(course) && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                <MapPinIcon className="h-4 w-4" aria-hidden />
                {formatLocation(course)}
              </p>
            )}
          </div>

          <TeeSelect course={course} value={tee} onChange={handleSelectTee} />

          {tee && lengthOptions.length > 0 && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-semibold text-slate-600">Round length</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['front9', 'back9', '18'] as RoundLength[]).map((len) => {
                  const enabled = lengthOptions.includes(len)
                  const active = roundLength === len
                  return (
                    <button
                      key={len}
                      type="button"
                      disabled={!enabled}
                      onClick={() => setRoundLength(len)}
                      className={[
                        'rounded-xl border px-2 py-3 text-sm font-semibold shadow-sm transition-colors',
                        active
                          ? 'border-fairway-500 bg-fairway-600 text-white'
                          : enabled
                            ? 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                            : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300',
                      ].join(' ')}
                    >
                      {ROUND_LENGTH_LABEL[len]}
                    </button>
                  )
                })}
              </div>
              {lengthOptions.length === 1 && (
                <p className="mt-1.5 text-xs text-slate-500">
                  This tee only has 9 holes on record, so only Front 9 is available.
                </p>
              )}
            </fieldset>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm transition-colors active:bg-fairway-800 disabled:opacity-50"
            >
              {starting && <SpinnerIcon className="h-5 w-5" aria-hidden />}
              Start round
            </button>
            {!tee && (
              <p className="mt-2 text-center text-xs text-slate-500">Pick a tee to continue.</p>
            )}
            {tee && !roundLength && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Choose a round length to start.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
