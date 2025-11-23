/**
 * Client-side Logger
 * Provides structured logging with levels for frontend
 */

export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private logLevel: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = import.meta.env.PROD;
    const envLogLevel = import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined;
    this.logLevel = envLogLevel || (this.isProduction ? LogLevel.INFO : LogLevel.DEBUG);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: this.isProduction ? undefined : error.stack,
        },
      }),
    };

    // In production, send to error tracking service (e.g., Sentry)
    if (this.isProduction && level === LogLevel.ERROR && error) {
      // TODO: Integrate with error tracking service
      // Sentry.captureException(error, { extra: context });
    }

    // Use console methods with structured logging
    const formatted = this.isProduction
      ? JSON.stringify(logEntry)
      : `${timestamp} [${level.toUpperCase()}] ${message}${context ? ` ${JSON.stringify(context)}` : ''}${error ? `\n${error.stack}` : ''}`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.formatMessage(LogLevel.ERROR, message, context, error);
  }

  warn(message: string, context?: LogContext): void {
    this.formatMessage(LogLevel.WARN, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.formatMessage(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.formatMessage(LogLevel.DEBUG, message, context);
  }
}

// Export singleton instance
export const logger = new Logger();

export default logger;

