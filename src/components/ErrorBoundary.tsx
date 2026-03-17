import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  showHomeButton?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console (in production, send to error tracking service)
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // In production, you would send this to an error tracking service like Sentry
    // Example:
    // Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    // Clear error state
    this.handleReset();
    
    // Navigate to home (reload page to reset all state)
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
          <motion.div
            className="max-w-md w-full rounded-[24px] p-6 border-2 border-red-500/30 bg-[#1C1C1E]/95 backdrop-blur-xl shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 30,
              mass: 0.8,
            }}
          >
            {/* Error Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 border-2 border-red-400/50 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-400" strokeWidth={2.5} />
              </div>
            </div>

            {/* Error Title */}
            <h2 className="text-title-2 text-white text-center mb-3">
              Something went wrong
            </h2>

            {/* Error Message */}
            <p className="text-[15px] text-white/80 text-center mb-6" style={{ fontWeight: 400 }}>
              We're sorry, but something unexpected happened. 
              {this.state.error && (
                <span className="block mt-2 text-[13px] text-red-400">
                  {this.state.error.message}
                </span>
              )}
            </p>

            {/* Error Details (Development Only) */}
            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="mb-6 p-4 rounded-[12px] bg-black/40 border border-white/10">
                <summary className="text-[13px] text-white/70 cursor-pointer" style={{ fontWeight: 500 }}>
                  Error Details (Dev Mode)
                </summary>
                <pre className="mt-3 text-[11px] text-red-300 overflow-auto max-h-48">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {/* Retry Button */}
              <motion.button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 border-2 border-white/30 shadow-lg"
                whileTap={{ scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 30,
                }}
              >
                <RefreshCw className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Try Again
                </span>
              </motion.button>

              {/* Home Button */}
              {this.props.showHomeButton && (
                <motion.button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-[#1C1C1E]/80 border-2 border-white/30 shadow-lg"
                  whileTap={{ scale: 0.95 }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 30,
                  }}
                >
                  <Home className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                  <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Go Home
                  </span>
                </motion.button>
              )}
            </div>

            {/* Support Message */}
            <p className="text-[13px] text-white/60 text-center mt-4" style={{ fontWeight: 400 }}>
              If this problem persists, please contact support
            </p>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight Error Boundary for specific components
 * Shows inline error instead of full-screen
 */
export class InlineErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Inline Error Boundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 rounded-[16px] border-2 border-red-500/30 bg-red-500/10 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] text-red-300 mb-2" style={{ fontWeight: 600 }}>
                Error loading component
              </p>
              {this.state.error && (
                <p className="text-[12px] text-red-400/80 mb-3" style={{ fontWeight: 400 }}>
                  {this.state.error.message}
                </p>
              )}
              <motion.button
                onClick={this.handleReset}
                className="text-[13px] text-white px-3 py-1.5 rounded-full bg-red-500/30 border border-red-400/50"
                style={{ fontWeight: 600 }}
                whileTap={{ scale: 0.95 }}
              >
                Retry
              </motion.button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
