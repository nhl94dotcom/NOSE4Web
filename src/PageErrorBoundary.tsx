import { Component, type ReactNode } from 'react'

// Around each page: where something in a page goes wrong as it is drawn, that page shows what happened in place of
// a blank window, and the ROM and every other page stay as they were (the work lives above it, in App).

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('NOSE4Web: a page could not be shown', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const details = `${error.name}: ${error.message}\n${error.stack ?? ''}`.slice(0, 2000)
    return (
      <main className="team">
        <h2>This part of the page could not be shown</h2>
        <p className="error">Something went wrong while drawing it. Your ROM and your other changes are still here: choose another page on the left, or try this one again.</p>
        <p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>{' '}
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(details).catch(() => undefined)
            }}
          >
            Copy the details
          </button>
        </p>
        <p className="note">
          Please send the details, with the page and section you clicked and the ROM, so that it can be fixed:
        </p>
        <pre className="note error-details">{details}</pre>
      </main>
    )
  }
}
