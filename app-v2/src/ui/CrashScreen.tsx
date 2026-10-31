// What the app shows when a screen fails to draw, instead of a blank page.
//
// When a component throws while drawing, React removes everything it drew,
// and the only way out was to close the app. A boundary round each section
// catches the failure there, so the navigation stays and the other sections
// still work; the one round the whole app catches the rest. Saved data lives
// in the database and on the sync server, so a reload is always safe.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Round the whole app: there is no navigation left to fall back on. */
  whole?: boolean;
}

interface State {
  error: Error | null;
}

export class CrashBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[crash]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <CrashScreen error={error} whole={this.props.whole} onRetry={() => this.setState({ error: null })} />;
  }
}

function CrashScreen({ error, whole, onRetry }: { error: Error; whole?: boolean; onRetry: () => void }) {
  // Safari's stack lists only the frames; Chrome's starts with the message.
  const frames = (error.stack || '').split('\n').filter(l => l.trim() && !l.includes(error.message)).slice(0, 4);
  return (
    <div className={`crash${whole ? ' crash--whole' : ''}`} role="alert">
      <div className="crash-card ds-card">
        <div className="ds-eyebrow">Something went wrong</div>
        <h1 className="crash-title">{whole ? 'The app stopped working' : 'This screen stopped working'}</h1>
        <p className="crash-text">
          Everything you had saved is safe. Reload the app to carry on{whole ? '' : ', or pick another section'}.
        </p>
        <div className="crash-actions">
          <button className="ds-btn ds-btn--primary" onClick={() => window.location.reload()}>Reload the app</button>
          <button className="ds-btn" onClick={onRetry}>Try again</button>
        </div>
        <details className="crash-details">
          <summary>Details</summary>
          <p>If this keeps happening, a screenshot of this helps find the cause.</p>
          <pre>{[`${error.name}: ${error.message}`, ...frames].join('\n')}</pre>
        </details>
      </div>
    </div>
  );
}
