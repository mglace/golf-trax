import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeftIcon, SpinnerIcon } from '@/components/icons'
import { createManualCourse } from '@/db/coursesRepo'
import {
  blankHoles,
  blankManualCourse,
  validateManualCourse,
  type ManualCourseInput,
  type ManualHoleInput,
} from '@/domain/manualCourse'
import type { Gender } from '@/db/types'

/**
 * Add a course by hand (Phase 2d) when it isn't in GolfCourseAPI. Produces a
 * negative-id course that flows into the normal tee/round-length setup, so the
 * rest of the app treats it like any other course.
 */
export function ManualCourseForm() {
  const navigate = useNavigate()
  const location = useLocation()
  // Prefill the club name from the search term when the user came from the
  // no-results state, so they don't retype what they just searched.
  const prefillClubName =
    typeof (location.state as { clubName?: unknown } | null)?.clubName === 'string'
      ? (location.state as { clubName: string }).clubName
      : ''
  const [form, setForm] = useState<ManualCourseInput>(() => ({
    ...blankManualCourse(),
    clubName: prefillClubName,
  }))
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  const errors = validateManualCourse(form)

  function set<K extends keyof ManualCourseInput>(key: K, value: ManualCourseInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setHoleCount(count: number) {
    setForm((f) => {
      const next = blankHoles(count)
      // Preserve values the user already entered for overlapping holes.
      for (let i = 0; i < Math.min(count, f.holes.length); i++) next[i] = f.holes[i]
      return { ...f, holes: next }
    })
  }

  function setHole(index: number, patch: Partial<ManualHoleInput>) {
    setForm((f) => ({
      ...f,
      holes: f.holes.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    }))
  }

  async function handleSave() {
    setShowErrors(true)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      const course = await createManualCourse(form)
      navigate(`/new/${course.id}`)
    } catch {
      setSaving(false)
    }
  }

  const num = (v: number) => (Number.isFinite(v) ? String(v) : '')
  const parseNum = (s: string) => (s.trim() === '' ? NaN : Number(s))

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
        <h1 className="text-xl font-bold tracking-tight">Add a course</h1>
      </header>

      <p className="mb-5 text-sm text-slate-500">
        Enter a course that isn’t in the course directory. Only par is required for each hole —
        handicap and yardage are optional.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="clubName" className="mb-1 block text-sm font-semibold text-slate-700">
            Course or club name
          </label>
          <input
            id="clubName"
            type="text"
            value={form.clubName}
            onChange={(e) => set('clubName', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-fairway-500 focus:outline-none focus:ring-1 focus:ring-fairway-500"
            placeholder="e.g. Sandy Pines Golf Club"
          />
          {showErrors && errors.clubName && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {errors.clubName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="courseName" className="mb-1 block text-sm font-semibold text-slate-700">
            Course name <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="courseName"
            type="text"
            value={form.courseName}
            onChange={(e) => set('courseName', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-fairway-500 focus:outline-none focus:ring-1 focus:ring-fairway-500"
            placeholder="e.g. North Course"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="city" className="mb-1 block text-sm font-semibold text-slate-700">
              City <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="city"
              type="text"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-fairway-500 focus:outline-none focus:ring-1 focus:ring-fairway-500"
            />
          </div>
          <div className="w-24">
            <label htmlFor="state" className="mb-1 block text-sm font-semibold text-slate-700">
              State
            </label>
            <input
              id="state"
              type="text"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-fairway-500 focus:outline-none focus:ring-1 focus:ring-fairway-500"
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">Holes</legend>
          <div className="grid grid-cols-2 gap-2">
            {[9, 18].map((count) => {
              const active = form.holes.length === count
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHoleCount(count)}
                  className={[
                    'rounded-xl border px-2 py-3 text-sm font-semibold shadow-sm transition-colors',
                    active
                      ? 'border-fairway-500 bg-fairway-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50',
                  ].join(' ')}
                >
                  {count} holes
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">Tee</legend>
          <div className="mb-2 grid grid-cols-2 gap-2">
            {(['male', 'female'] as Gender[]).map((g) => {
              const active = form.gender === g
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set('gender', g)}
                  className={[
                    'rounded-xl border px-2 py-3 text-sm font-semibold shadow-sm transition-colors',
                    active
                      ? 'border-fairway-500 bg-fairway-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50',
                  ].join(' ')}
                >
                  {g === 'male' ? "Men's" : "Women's"}
                </button>
              )
            })}
          </div>
          <input
            aria-label="Tee name"
            type="text"
            value={form.teeName}
            onChange={(e) => set('teeName', e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-fairway-500 focus:outline-none focus:ring-1 focus:ring-fairway-500"
            placeholder="Tee name (e.g. White)"
          />
          {showErrors && errors.teeName && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {errors.teeName}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">
            Hole details <span className="font-normal text-slate-400">(par required)</span>
          </legend>
          {showErrors && errors.holes && (
            <p className="mb-2 text-xs text-red-600" role="alert">
              {errors.holes}
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[3rem_1fr_1fr_1fr] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Hole</span>
              <span>Par</span>
              <span>Hcp</span>
              <span>Yds</span>
            </div>
            {form.holes.map((h, i) => (
              <div
                key={i}
                className="grid grid-cols-[3rem_1fr_1fr_1fr] items-center gap-2 border-b border-slate-100 px-3 py-1.5 last:border-b-0"
              >
                <span className="text-sm font-medium text-slate-500">{i + 1}</span>
                <input
                  aria-label={`Hole ${i + 1} par`}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={3}
                  max={7}
                  value={num(h.par)}
                  onChange={(e) => setHole(i, { par: parseNum(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 focus:border-fairway-500 focus:outline-none"
                />
                <input
                  aria-label={`Hole ${i + 1} handicap`}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  max={form.holes.length}
                  value={num(h.handicap)}
                  onChange={(e) => setHole(i, { handicap: parseNum(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 focus:border-fairway-500 focus:outline-none"
                />
                <input
                  aria-label={`Hole ${i + 1} yardage`}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={0}
                  value={num(h.yardage)}
                  onChange={(e) => setHole(i, { yardage: parseNum(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 focus:border-fairway-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-fairway-700 px-4 py-4 text-lg font-semibold text-white shadow-sm transition-colors active:bg-fairway-800 disabled:opacity-50"
        >
          {saving && <SpinnerIcon className="h-5 w-5" aria-hidden />}
          Save &amp; continue
        </button>
      </div>
    </div>
  )
}
