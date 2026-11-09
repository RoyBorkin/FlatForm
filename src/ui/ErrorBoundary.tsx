/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { Component, type ReactNode } from 'react';

declare global {
  interface Window {
    __flatformStarted?: () => void;
    __flatformFail?: (title: string, detail?: string, hint?: string) => void;
  }
}

/**
 * Last line of defence: if the interface itself crashes, say so plainly
 * (with a way back) instead of leaving a frozen splash or a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
    document.getElementById('boot')?.remove();
  }

  private reset = () => {
    try {
      localStorage.removeItem('flatform.autosave.v1');
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="crash__box">
          <h1>FlatForm hit a problem</h1>
          <p>The interface stopped because of an unexpected error. Your last autosave is kept unless you choose to start fresh.</p>
          <pre>{error.message}</pre>
          <div className="crash__actions">
            <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
              Reload
            </button>
            <button type="button" className="btn" onClick={this.reset}>
              Start fresh
            </button>
          </div>
        </div>
      </div>
    );
  }
}
