/**
 * Metrics Middleware
 * Collects performance and error metrics for monitoring
 */

import { Request, Response, NextFunction } from 'express';

interface Metrics {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byEndpoint: Record<string, number>;
  };
  errors: {
    total: number;
    byEndpoint: Record<string, number>;
    byStatus: Record<number, number>;
  };
  latency: {
    total: number;
    average: number;
    byEndpoint: Record<string, number[]>;
  };
  timestamps: number[];
}

class MetricsCollector {
  private metrics: Metrics;

  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byEndpoint: {},
      },
      errors: {
        total: 0,
        byEndpoint: {},
        byStatus: {},
      },
      latency: {
        total: 0,
        average: 0,
        byEndpoint: {},
      },
      timestamps: [],
    };
  }

  /**
   * Record a request
   */
  recordRequest(method: string, endpoint: string, duration: number, statusCode: number): void {
    this.metrics.requests.total++;
    
    // Count by method
    this.metrics.requests.byMethod[method] = (this.metrics.requests.byMethod[method] || 0) + 1;
    
    // Count by endpoint
    this.metrics.requests.byEndpoint[endpoint] = (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;
    
    // Record latency
    this.metrics.latency.total += duration;
    this.metrics.latency.average = this.metrics.latency.total / this.metrics.requests.total;
    
    if (!this.metrics.latency.byEndpoint[endpoint]) {
      this.metrics.latency.byEndpoint[endpoint] = [];
    }
    this.metrics.latency.byEndpoint[endpoint].push(duration);
    
    // Keep only last 100 latency measurements per endpoint
    if (this.metrics.latency.byEndpoint[endpoint].length > 100) {
      this.metrics.latency.byEndpoint[endpoint].shift();
    }
    
    // Record errors
    if (statusCode >= 400) {
      this.metrics.errors.total++;
      this.metrics.errors.byEndpoint[endpoint] = (this.metrics.errors.byEndpoint[endpoint] || 0) + 1;
      this.metrics.errors.byStatus[statusCode] = (this.metrics.errors.byStatus[statusCode] || 0) + 1;
    }
    
    // Record timestamp
    this.metrics.timestamps.push(Date.now());
    
    // Keep only last 1000 timestamps
    if (this.metrics.timestamps.length > 1000) {
      this.metrics.timestamps.shift();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    requests: { total: number; rate: number };
    errors: { total: number; rate: number };
    latency: { average: number; p50: number; p95: number; p99: number };
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const recentRequests = this.metrics.timestamps.filter(ts => ts > oneMinuteAgo).length;
    
    const errorRate = this.metrics.requests.total > 0
      ? (this.metrics.errors.total / this.metrics.requests.total) * 100
      : 0;
    
    // Calculate percentiles for latency
    const allLatencies = Object.values(this.metrics.latency.byEndpoint).flat().sort((a, b) => a - b);
    const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)] || 0;
    const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)] || 0;
    const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)] || 0;
    
    return {
      requests: {
        total: this.metrics.requests.total,
        rate: recentRequests, // requests per minute
      },
      errors: {
        total: this.metrics.errors.total,
        rate: errorRate,
      },
      latency: {
        average: this.metrics.latency.average,
        p50,
        p95,
        p99,
      },
    };
  }

  /**
   * Reset metrics (for testing)
   */
  reset(): void {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byEndpoint: {},
      },
      errors: {
        total: 0,
        byEndpoint: {},
        byStatus: {},
      },
      latency: {
        total: 0,
        average: 0,
        byEndpoint: {},
      },
      timestamps: [],
    };
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();

/**
 * Express middleware to collect metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const endpoint = req.path;
  const method = req.method;

  // Override res.end to capture status code and duration
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, encodingOrCb?: BufferEncoding | (() => void), cb?: () => void): ReturnType<typeof originalEnd> {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    metricsCollector.recordRequest(method, endpoint, duration, statusCode);
    
    // Handle different overloads of res.end
    if (typeof encodingOrCb === 'function') {
      // res.end(chunk, cb)
      return originalEnd(chunk, encodingOrCb);
    } else if (cb && encodingOrCb) {
      // res.end(chunk, encoding, cb)
      return originalEnd(chunk, encodingOrCb as BufferEncoding, cb);
    } else if (encodingOrCb) {
      // res.end(chunk, encoding)
      return originalEnd(chunk, encodingOrCb as BufferEncoding);
    } else {
      // res.end(chunk)
      return originalEnd(chunk);
    }
  };

  next();
}

/**
 * Get metrics endpoint handler
 */
export function getMetricsHandler(req: Request, res: Response): void {
  const summary = req.query.summary === 'true';
  
  if (summary) {
    res.json(metricsCollector.getSummary());
  } else {
    res.json(metricsCollector.getMetrics());
  }
}

export { metricsCollector };

