import { TraceInstance } from "./trace.js";
import type { BreadcrumbConfig, TraceContext, Sink } from "./types.js";

export class Breadcrumb {
  private readonly sinks: Sink[];
  private readonly logErrors: boolean;
  private readonly generateId?: () => string;

  constructor(config: BreadcrumbConfig) {
    this.sinks = config.sinks;
    this.logErrors = config.logErrors ?? true;
    this.generateId = config.generateId;
  }

  /**
   * Start a new trace
   */
  async trace(context: TraceContext = {}): Promise<TraceInstance> {
    const trace = new TraceInstance(this.sinks, context, {
      logErrors: this.logErrors,
      generateId: this.generateId,
    });
    await trace.start();
    return trace;
  }

  /**
   * Add a sink at runtime
   */
  addSink(sink: Sink): void {
    this.sinks.push(sink);
  }

  /**
   * Remove a sink by name
   */
  removeSink(name: string): void {
    const index = this.sinks.findIndex((s) => s.name === name);
    if (index !== -1) {
      this.sinks.splice(index, 1);
    }
  }
}

/**
 * Create a new breadcrumb instance
 */
export function createBreadcrumb(config: BreadcrumbConfig): Breadcrumb {
  return new Breadcrumb(config);
}

// Singleton instance for simple usage
let defaultInstance: Breadcrumb | null = null;

/**
 * Initialize the default breadcrumb instance
 */
export function init(config: BreadcrumbConfig): Breadcrumb {
  defaultInstance = new Breadcrumb(config);
  return defaultInstance;
}

/**
 * Get the default breadcrumb instance
 * Throws if not initialized
 */
export function getInstance(): Breadcrumb {
  if (!defaultInstance) {
    throw new Error(
      "[breadcrumb] Not initialized. Call init() first or use createBreadcrumb()."
    );
  }
  return defaultInstance;
}

/**
 * Start a new trace using the default instance
 */
export async function trace(context: TraceContext = {}): Promise<TraceInstance> {
  return getInstance().trace(context);
}
