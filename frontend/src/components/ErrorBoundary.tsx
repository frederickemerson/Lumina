/**
 * Error Boundary Component
 * Catches React component errors and displays user-friendly error messages
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error using logger
    logger.error('ErrorBoundary caught an error', {
      componentStack: errorInfo.componentStack,
    }, error);

    // In production, you would log to an error reporting service
    // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Something went wrong</h2>
          <p style={{ color: '#999', marginBottom: '2rem' }}>
            We're sorry, but something unexpected happened. Please try refreshing the page.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <details style={{
              marginBottom: '2rem',
              padding: '1rem',
              backgroundColor: '#1a1a1a',
              borderRadius: '8px',
              maxWidth: '600px',
              textAlign: 'left',
            }}>
              <summary style={{ color: '#fff', cursor: 'pointer', marginBottom: '0.5rem' }}>
                Error Details (Development Only)
              </summary>
              <pre style={{
                color: '#ff6b6b',
                fontSize: '0.875rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

