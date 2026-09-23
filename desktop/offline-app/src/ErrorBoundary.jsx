import { Component } from 'react'

/**
 * Safety net for the offline shell: without this, an uncaught render error
 * anywhere in the tree unmounts the whole React root and leaves a permanent
 * blank/white screen with nothing left running (including the connectivity
 * poller that would otherwise auto-switch back online).
 *
 * @augments {Component<{ children: import('react').ReactNode }>}
 */
export class OfflineErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console -- surfaced in Electron's console for diagnosis
    console.error('[offline-app] Uncaught render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-hisabi-background flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="type-headline-md text-hisabi-on-surface font-bold">
            Something went wrong
          </p>
          <p className="type-body-md text-hisabi-on-surface-variant max-w-sm">
            {this.state.error?.message || 'The app hit an unexpected error.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-hisabi-primary text-hisabi-on-primary type-label-md rounded-lg px-hisabi-lg py-hisabi-sm font-bold"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
