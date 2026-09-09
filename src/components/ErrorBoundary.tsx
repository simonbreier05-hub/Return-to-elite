"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches a rendering error anywhere in its subtree and shows a fallback
 * instead of taking the whole screen down with it. There was no boundary
 * anywhere in the app before this — a single bad payload (e.g. a
 * `workorder:update` broadcast missing a field a component renders
 * unconditionally) crashed the entire hub, not just the widget that choked
 * on it. AppShell wraps each hub's `children` in one, so the header, nav
 * and notification bell stay usable even when the page body doesn't.
 *
 * Class component because React only supports error boundaries via
 * `componentDidCatch`/`getDerivedStateFromError` — there is no hook
 * equivalent.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught a render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-status-out-of-order/30 bg-status-out-of-order/5 p-6 text-center shadow-sm">
        <p className="mb-1 font-serif text-xl text-status-out-of-order">Something went wrong</p>
        <p className="mb-4 text-sm text-graphite/70">
          This screen hit an unexpected error and couldn&apos;t finish rendering. The rest of the app is unaffected.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-11 rounded-xl bg-navy px-5 text-sm font-semibold text-ivory transition active:scale-[0.98]"
        >
          Reload
        </button>
      </div>
    );
  }
}
