"use client";

import { Component, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface InnerProps {
  children: ReactNode;
  title: string;
  message: string;
  reloadLabel: string;
}
interface InnerState {
  hasError: boolean;
}

/**
 * React error boundaries have to be class components — there is no hooks
 * equivalent for getDerivedStateFromError/componentDidCatch — so the actual
 * catching lives here, with copy passed in as props from the functional
 * wrapper below (which is free to call useLocale()).
 */
class ErrorBoundaryClass extends Component<InnerProps, InnerState> {
  state: InnerState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught a render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-(--glass-radius-lg) border border-status-danger-fg/40 bg-status-danger-bg p-8 text-center">
          <p className="text-title-22 text-status-danger-fg">{this.props.title}</p>
          <p className="max-w-sm text-sm text-text-secondary">{this.props.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 h-11 rounded-(--glass-radius-md) border border-border-accent bg-champagne px-5 text-sm font-semibold text-text-on-accent transition active:scale-[0.98]"
          >
            {this.props.reloadLabel}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Wraps one screen's content (see AppShell) so a single rendering error in,
 * say, a work-order card missing a field doesn't take down the whole hub —
 * only this boundary's slice falls back, with a "reload" escape hatch.
 * There is no ErrorBoundary anywhere else in the app; without this, an
 * uncaught render error unmounts everything up to the nearest one (React's
 * default: the whole page).
 */
export default function ErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return (
    <ErrorBoundaryClass
      title={t("errorBoundary.title")}
      message={t("errorBoundary.message")}
      reloadLabel={t("errorBoundary.reload")}
    >
      {children}
    </ErrorBoundaryClass>
  );
}
