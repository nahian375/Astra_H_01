/**
 * ASTRA Health - Local AI React Error Boundary
 * Prevents the entire application from going blank if an exception occurs during Local AI generation or rendering.
 * Keeps the main application shell and navigation visible, and provides a safe Retry action.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Cpu, AlertCircle, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class LocalAIErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ASTRA Local AI ErrorBoundary] Caught Local AI rendering exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div 
          id="astra-ai-error-fallback"
          className="flex flex-col items-center justify-center p-6 sm:p-10 rounded-2xl bg-slate-900/90 border border-rose-500/50 shadow-2xl backdrop-blur-sm min-h-[500px] text-slate-100 font-sans"
        >
          <div className="flex flex-col items-center text-center max-w-xl space-y-4">
            <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-500/60 shadow-lg text-rose-400">
              <Cpu className="w-8 h-8 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold uppercase tracking-wider mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Local AI Screen Recovery Shield</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-mono text-slate-100">
                Local ASTRA AI Assistant Recovered
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                An issue occurred while rendering the Local ASTRA Assistant screen. The application shell remains active, and telemetry monitoring continues on device.
              </p>
            </div>

            {/* Error Diagnostics Panel */}
            <div className="w-full text-left p-3.5 rounded-xl bg-slate-950 border border-rose-900/60 text-xs font-mono space-y-1.5 overflow-x-auto max-h-48 scrollbar-thin">
              <div className="text-[10px] text-rose-400 font-bold uppercase flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Diagnostic Exception Message:</span>
              </div>
              <div className="text-rose-200/90 font-mono break-words">
                {this.state.error?.message || 'Unknown Local AI rendering exception'}
              </div>
              {this.state.errorInfo?.componentStack && (
                <div className="text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack.slice(0, 300)}...
                </div>
              )}
            </div>

            {/* Action Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition shadow-lg cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry Local ASTRA AI</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-mono pt-2">
              Note: Autonomous medical baselines and telemetry rules remain 100% active.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
