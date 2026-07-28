import { useEffect } from 'react'
import { useDialogFocus } from './useDialogFocus'

interface ConfirmDialogProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as a destructive action. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Small modal confirmation dialog. Closes on Escape or backdrop click. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {message && <p className="mt-1.5 text-sm text-slate-500">{message}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 font-semibold text-slate-700 active:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'flex-1 rounded-xl py-2.5 font-semibold text-white',
              destructive ? 'bg-red-600 active:bg-red-700' : 'bg-fairway-700 active:bg-fairway-800',
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
