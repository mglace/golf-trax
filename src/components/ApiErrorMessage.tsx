import { ApiError, type ApiErrorKind } from '@/api/golfCourseApi'

interface ApiErrorMessageProps {
  error: ApiError
  onRetry?: () => void
}

const COPY: Record<ApiErrorKind, { title: string; body: string; retryable: boolean }> = {
  'missing-key': {
    title: 'API key not set',
    body: 'Add your GolfCourseAPI key to .env.local (VITE_GOLF_API_KEY) and restart the dev server.',
    retryable: false,
  },
  unauthorized: {
    title: 'API key rejected',
    body: 'GolfCourseAPI returned 401. Double-check the key in .env.local.',
    retryable: true,
  },
  'not-found': {
    title: 'Not found',
    body: "We couldn't find that course.",
    retryable: false,
  },
  'rate-limited': {
    title: 'Slow down a moment',
    body: 'Too many requests were sent. Wait a few seconds and try again.',
    retryable: true,
  },
  network: {
    title: 'Can’t reach the course database',
    body: 'You appear to be offline, or the request was blocked. Course search needs a connection.',
    retryable: true,
  },
  server: {
    title: 'GolfCourseAPI is having trouble',
    body: 'The service returned an error. Please try again shortly.',
    retryable: true,
  },
  unknown: {
    title: 'Something went wrong',
    body: 'An unexpected error occurred while contacting GolfCourseAPI.',
    retryable: true,
  },
}

export function ApiErrorMessage({ error, onRetry }: ApiErrorMessageProps) {
  const copy = COPY[error.kind] ?? COPY.unknown

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1 text-amber-800">{copy.body}</p>
      {copy.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          Try again
        </button>
      )}
    </div>
  )
}
