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
    // A part of the site that could not be loaded (the site was updated while this tab was open): only reloading
    // the page brings it, and the work comes back with Continue editing.
    if (/dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i.test(error.message)) {
      return (
        <main className="team">
          <h2>This page could not be loaded</h2>
          <p className="error">
            The site has probably been updated since this tab was opened. Reload the page; your work is kept in this
            browser, so choose <b>Continue editing</b> on the first screen to carry on.
          </p>
          <p>
            <button onClick={() => window.location.reload()}>Reload the page</button>
          </p>
        </main>
      )
    }
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
