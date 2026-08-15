import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered in place of {@link Props.children} once a descendant throws. */
  fallback: ReactNode
  /** Called when an error is caught — e.g. to record it or resolve fallback
   * state elsewhere (the boundary itself just swaps in `fallback`). */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
}

/**
 * Minimal error boundary. The app is offline-first and code-splits routes plus
 * the Auth0 SDK, so a dropped connection on a not-yet-precached chunk makes a
 * `React.lazy` import reject and throw during render. Without a boundary that
 * throw tears down the whole React root — a blank screen on an app that was
 * otherwise usable. This contains the blast radius to the wrapped subtree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
