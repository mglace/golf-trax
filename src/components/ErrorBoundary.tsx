import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered in place of {@link Props.children} once a descendant throws. */
  fallback: ReactNode
  /** Called when an error is caught — e.g. to record it or resolve fallback
   * state elsewhere (the boundary itself just swaps in `fallback`). */
  onError?: (error: Error, info: ErrorInfo) => void
  /**
   * Which errors this boundary owns. When set, an error that fails the
   * predicate is re-thrown so it propagates to the next boundary up rather
   * than being swallowed and misattributed to this boundary's `fallback`.
   * Omitted → the boundary catches everything (the plain "contain the blast
   * radius" case). The route boundary passes `isChunkLoadError` so a failed
   * `React.lazy` fetch gets the reload prompt, but a genuine render bug in the
   * loaded page surfaces normally instead of looping on a reload that recurs.
   */
  shouldCatch?: (error: Error) => boolean
}

interface State {
  error: Error | null
}

/**
 * Minimal error boundary. The app is offline-first and code-splits routes plus
 * the Auth0 SDK, so a dropped connection on a not-yet-precached chunk makes a
 * `React.lazy` import reject and throw during render. Without a boundary that
 * throw tears down the whole React root — a blank screen on an app that was
 * otherwise usable. This contains the blast radius to the wrapped subtree.
 *
 * A {@link Props.shouldCatch} predicate optionally narrows what the boundary
 * owns; anything it rejects is re-thrown for an outer boundary to handle.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Only notify for errors this boundary owns; a rejected error is re-thrown
    // in render() and belongs to an outer boundary.
    if (this.handles(error)) this.props.onError?.(error, info)
  }

  private handles(error: Error): boolean {
    return !this.props.shouldCatch || this.props.shouldCatch(error)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      // Not ours — re-throw so the next boundary up can handle it. React will
      // unmount this subtree and propagate to an ancestor boundary (or the
      // root) rather than showing our fallback for an unrelated error.
      if (!this.handles(error)) throw error
      return this.props.fallback
    }
    return this.props.children
  }
}
