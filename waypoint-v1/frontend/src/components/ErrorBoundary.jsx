import { Component } from 'react';
import { colors, s } from '../styles/tokens.js';

/**
 * App had no error boundary at all: any render-time exception on any
 * page unmounted the entire tree, nav included, leaving a blank white
 * screen with no clue what happened (the Scorecard crash, 2026-09-24).
 * Wrapped around page content inside Shell, keyed by pathname in
 * App.jsx, so one broken page shows a readable failure with the nav
 * still usable — and navigating away clears it.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page render failed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ ...s.page, maxWidth: 640 }}>
        <div style={{ ...s.card, marginTop: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 650, color: colors.ink900, marginBottom: 6 }}>This page failed to load</div>
          <p style={{ fontSize: 14, color: colors.ink600, margin: '0 0 16px' }}>
            Something in this view broke while rendering. The rest of WayPoint is unaffected — use the menu above, or reload to try again.
          </p>
          <pre style={{ fontSize: 12, color: colors.danger, background: colors.dangerBg, padding: 12, borderRadius: 8, overflowX: 'auto', margin: '0 0 16px' }}>
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button style={s.btnSecondary} onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}
