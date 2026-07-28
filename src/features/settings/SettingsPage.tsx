import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { exportBackup, importBackup } from '@/db/backup'
import {
  BackupError,
  backupFilename,
  parseBackup,
  type BackupData,
} from '@/domain/backup'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DownloadIcon, SpinnerIcon, UploadIcon } from '@/components/icons'

/** A staged import awaiting user confirmation (parsed but not yet written). */
interface PendingImport {
  data: BackupData
  fileName: string
  skipped: { courses: number; rounds: number }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }

/**
 * Settings — currently the home for local-data backup. Because the MVP stores
 * everything on-device, an export/import pair is the only protection against a
 * cleared browser wiping a user's rounds, and it doubles as the "move to a new
 * device" path until real cloud sync (Phase 2) exists.
 */
export function SettingsPage() {
  const roundCount = useLiveQuery(() => db.rounds.count(), [])
  const courseCount = useLiveQuery(() => db.courses.count(), [])

  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [pending, setPending] = useState<PendingImport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setStatus({ kind: 'working' })
    try {
      const backup = await exportBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = backupFilename(backup.exportedAt)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      const total = backup.data.rounds.length
      setStatus({
        kind: 'success',
        message: `Exported ${total} ${total === 1 ? 'round' : 'rounds'} to a backup file.`,
      })
    } catch {
      setStatus({ kind: 'error', message: 'Something went wrong creating the backup.' })
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so choosing the same file again re-triggers onChange.
    e.target.value = ''
    if (!file) return
    setStatus({ kind: 'working' })
    try {
      const text = await file.text()
      const { backup, skipped } = parseBackup(text)
      setPending({ data: backup.data, fileName: file.name, skipped })
      setStatus({ kind: 'idle' })
    } catch (err) {
      const message =
        err instanceof BackupError
          ? err.message
          : "Couldn't read that file. Make sure it's a GolfTrax backup."
      setStatus({ kind: 'error', message })
    }
  }

  async function handleConfirmImport() {
    if (!pending) return
    setStatus({ kind: 'working' })
    const { data, skipped } = pending
    setPending(null)
    try {
      const result = await importBackup(data)
      const parts = [`${result.rounds} ${result.rounds === 1 ? 'round' : 'rounds'}`]
      if (result.courses) parts.push(`${result.courses} courses`)
      const skippedTotal = skipped.courses + skipped.rounds
      const suffix = skippedTotal ? ` (${skippedTotal} unreadable record(s) skipped)` : ''
      setStatus({ kind: 'success', message: `Restored ${parts.join(' and ')}.${suffix}` })
    } catch {
      setStatus({ kind: 'error', message: 'Something went wrong importing the backup.' })
    }
  }

  const working = status.kind === 'working'
  const pendingRounds = pending?.data.rounds.length ?? 0
  const pendingCourses = pending?.data.courses.length ?? 0

  return (
    <div className="py-6">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-slate-500">Manage your local data.</p>

      <section aria-labelledby="backup-heading" className="rounded-2xl border border-slate-200 p-4">
        <h2 id="backup-heading" className="text-base font-semibold text-slate-900">
          Backup &amp; restore
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Your rounds are stored only on this device. Export a backup file to keep them safe or move
          them to another device.
        </p>

        <dl className="mt-4 flex gap-6 text-sm">
          <div>
            <dt className="text-slate-500">Rounds</dt>
            <dd className="text-lg font-semibold text-slate-900">{roundCount ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Courses cached</dt>
            <dd className="text-lg font-semibold text-slate-900">{courseCount ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={working}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-fairway-700 px-4 py-3 font-semibold text-white active:bg-fairway-800 disabled:opacity-60"
          >
            <DownloadIcon className="h-5 w-5" aria-hidden />
            Export backup
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={working}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-60"
          >
            <UploadIcon className="h-5 w-5" aria-hidden />
            Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={handleFileChosen}
            aria-hidden
            tabIndex={-1}
          />
        </div>

        <div aria-live="polite" className="mt-3 min-h-[1.25rem] text-sm">
          {working && (
            <span className="flex items-center gap-2 text-slate-500">
              <SpinnerIcon className="h-4 w-4" aria-hidden />
              Working…
            </span>
          )}
          {status.kind === 'success' && <span className="text-fairway-700">{status.message}</span>}
          {status.kind === 'error' && (
            <span className="text-red-600" role="alert">
              {status.message}
            </span>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Importing merges the backup into this device — matching rounds are updated and new ones are
          added. Nothing already on this device is deleted.
        </p>
      </section>

      {pending && (
        <ConfirmDialog
          title="Import this backup?"
          message={`“${pending.fileName}” contains ${pendingRounds} round${
            pendingRounds === 1 ? '' : 's'
          } and ${pendingCourses} course${
            pendingCourses === 1 ? '' : 's'
          }. They'll be merged into this device.`}
          confirmLabel="Import"
          onConfirm={handleConfirmImport}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
