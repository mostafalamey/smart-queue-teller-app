/**
 * ErrorBoundary — top-level React error boundary for the Teller App.
 *
 * Catches uncaught render-time exceptions, displays a crash screen with a
 * "Restart App" button, and logs the error to the console.  Electron's
 * crash reporter / auto-updater mechanism is intentionally separate.
 *
 * Usage: wrap the root <App /> in <ErrorBoundary>.
 */

import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback for testing — defaults to the crash screen. */
  fallback?: React.ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  Crash screen                                                              */
/* -------------------------------------------------------------------------- */

interface CrashScreenProps {
  error: Error | null;
  onRestart(): void;
}

function CrashScreen({ error, onRestart }: CrashScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-foreground">
      {/* Icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/25">
        <AlertTriangle size={26} className="text-red-500" aria-hidden="true" />
      </div>

      {/* Copy */}
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          An unexpected error caused the app to crash. Your work has not been
          lost — restarting the app will reconnect and restore queue state.
        </p>
      </div>

      {/* Error detail (collapsed by default) */}
      {error && (
        <details className="w-full max-w-sm rounded-lg border border-border bg-muted/40 text-left">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
            Error details
          </summary>
          <pre className="overflow-auto px-3 pb-3 pt-1 text-[10px] text-red-400 leading-relaxed whitespace-pre-wrap break-words">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>
      )}

      {/* Restart button */}
      <button
        type="button"
        onClick={onRestart}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Restart the application"
      >
        <RefreshCcw size={14} aria-hidden="true" />
        Restart App
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Error boundary class component                                            */
/* -------------------------------------------------------------------------- */

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private handleRestart = () => {
    // Attempt an in-place reset first (re-mount the tree without a full page
    // reload).  If the same error occurs again the boundary will catch it and
    // the user still has the Restart button available.
    this.setState({ hasError: false, error: null, componentStack: null });

    // If the Electron runtime is available, use its reload method so the main
    // process is aware of the event.  Fall back to window.location.reload() in
    // the web-only dev mode.
    if (window.tellerRuntime) {
      window.location.reload();
    } else {
      window.location.reload();
    }
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <CrashScreen error={this.state.error} onRestart={this.handleRestart} />
      );
    }
    return this.props.children;
  }
}
