import { Component, type ReactNode } from 'react'

import { strings } from '@/strings'

// onRetry runs before the screen remounts, for example to start a failed lazy load again.
type Props = { children: ReactNode; onRetry?: () => void }
type State = { failed: boolean; attempt: number }

// Live queries throw their errors while rendering. This catches them for one screen, shows a
// message, and remounts the screen on Try again. React has no hook for this, so it's a class.
export class ScreenErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    console.error('screen failed to render', error)
  }

  private retry = () => {
    this.props.onRetry?.()
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
  }

  override render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex flex-col items-start gap-3">
          <h2 className="text-lg font-semibold">{strings.screenError.title}</h2>
          <p>{strings.screenError.body}</p>
          <button
            type="button"
            onClick={this.retry}
            className="min-h-11 rounded-lg border border-border px-4 font-medium"
          >
            {strings.screenError.retry}
          </button>
        </div>
      )
    }
    // A new key remounts the children, so their queries run again.
    return <div key={this.state.attempt}>{this.props.children}</div>
  }
}
