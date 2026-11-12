import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  sectionName?: string;
  onReset?: () => void;
  isRoot?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ASTRA Health - Resilient Mission Error Boundary
 * Prevents subsystem glitches from crashing the entire application.
 * Sanitizes error messages to protect sensitive telemetry and API keys.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Sanitize any potential API keys from error messages before logging
    const sanitizedMsg = (error?.message || 'Unknown runtime anomaly')
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
      .replace(/key=[^&\s]+/g, 'key=[REDACTED]');
    
    console.error(`[ASTRA ErrorBoundary:${this.props.sectionName || 'Root'}] Caught anomaly:`, sanitizedMsg, errorInfo);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleResetLocalData = async () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.clear();
        window.sessionStorage.clear();
        // Clear caches if available
        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map(k => window.caches.delete(k)));
        }
        window.location.href = '/';
      }
    } catch {
      window.location.reload();
    }
  };

  private handleSafeRecovery = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const sanitizedError = (this.state.error?.message || 'System subsystem encountered an unexpected exception')
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
        .slice(0, 160);

      // Subsystem / Module-level fallback (compact)
      if (!this.props.isRoot) {
        return (
          <div className="p-6 rounded-2xl bg-slate-950/80 border border-amber-500/30 backdrop-blur-md shadow-xl text-slate-100 font-mono my-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-wide uppercase text-amber-300">
                  {this.props.sectionName || 'Module'} Subsystem Isolated
                </h3>
                <p className="text-[11px] text-slate-400">
                  {this.props.fallbackTitle || 'A non-fatal variance occurred. Core navigation and life support remain nominal.'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 mb-4 overflow-hidden text-ellipsis">
              <code>{sanitizedError}</code>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={this.handleSafeRecovery}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 font-mono text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Subsystem</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition cursor-pointer"
              >
                Reload Console
              </button>
            </div>
          </div>
        );
      }

      // Root Application fallback
      return (
        <div className="min-h-screen bg-[#020612] flex flex-col items-center justify-center p-6 text-slate-100 font-mono select-none">
          <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-slate-950/90 border border-cyan-500/40 shadow-2xl backdrop-blur-xl space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto shadow-lg shadow-cyan-950">
              <AlertTriangle className="w-7 h-7 text-amber-400 animate-pulse" />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-widest uppercase text-white">
                ASTRA Health Diagnostic Recovery
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                The console recovered from an unhandled initialization condition.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-left text-slate-300 overflow-hidden text-ellipsis">
              <span className="text-[10px] text-slate-500 uppercase block mb-0.5">Diagnostic Report</span>
              <code>{sanitizedError}</code>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Console</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetLocalData}
                className="w-full py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset Local Cache & Re-Initialize</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-500 pt-1">
              MARS-01 • Autonomous Health Monitoring System
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
