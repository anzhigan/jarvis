/**
 * Minimal class-based ErrorBoundary so a single component's crash doesn't
 * white-screen the whole app. Renders a friendly fallback with the error
 * message + a "Retry" button that re-mounts the children fresh.
 *
 * Use sparingly — at boundaries where partial failure is preferable to a
 * full unmount (e.g. a sidebar item's detail view).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Optional label shown above the error — describes the boundary's scope
   *  (e.g. "Goal view"). Defaults to "This section". */
  label?: string;
  children: ReactNode;
  /** Called once per caught error. Useful for logging to a service. */
  onError?: (err: Error, info: ErrorInfo) => void;
}

interface State {
  err: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- intentional surface for debugging
    console.error(`[${this.props.label ?? 'ErrorBoundary'}]`, err, info.componentStack);
    this.props.onError?.(err, info);
  }

  reset = () => this.setState({ err: null });

  render(): ReactNode {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: '24px',
            margin: '24px',
            border: '1px solid var(--hairline-strong)',
            borderRadius: 'var(--r-card)',
            background: 'var(--paper)',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            color: 'var(--ink-3)',
            maxWidth: 640,
          }}
        >
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--rust)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
          }}>
            {this.props.label ?? 'This section'} crashed
          </div>
          <div style={{ marginBottom: 12, color: 'var(--ink-2)' }}>
            {this.state.err.message || 'Unknown error'}
          </div>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontFamily: 'var(--font-ui)',
              background: 'var(--indigo)',
              color: 'var(--paper)',
              border: 0,
              borderRadius: 'var(--r-pill)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
