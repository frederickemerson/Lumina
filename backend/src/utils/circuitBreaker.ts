/**
 * Circuit Breaker pattern for external service calls
 * Prevents cascading failures by opening circuit after threshold failures
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening circuit
  successThreshold?: number; // Number of successes in half-open to close circuit
  timeout?: number; // Time in ms before attempting half-open
  resetTimeout?: number; // Time in ms before attempting recovery
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  resetTimeout: 30000, // 30 seconds
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition to half-open
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.options.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        // Log state transition (logger will be imported by services using circuit breaker)
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: unknown) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        // Circuit closed - service recovered
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during half-open, open circuit again
      this.state = CircuitState.OPEN;
      // Circuit opened - service still failing
    } else {
      this.failureCount++;
      if (this.failureCount >= this.options.failureThreshold) {
        this.state = CircuitState.OPEN;
        // Circuit opened - failure threshold reached
      }
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Create a circuit breaker instance for a service
 */
export function createCircuitBreaker(serviceName: string, options?: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreaker(options);
}

