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

  async trace(context: TraceContext = {}): Promise<TraceInstance> {
    const trace = new TraceInstance(this.sinks, context, {
      logErrors: this.logErrors,
      generateId: this.generateId,
    });
    await trace.start();
    return trace;
  }

  addSink(sink: Sink): void {
    this.sinks.push(sink);
  }

  removeSink(name: string): void {
    const index = this.sinks.findIndex((s) => s.name === name);
    if (index !== -1) {
      this.sinks.splice(index, 1);
    }
  }
}

export function createBreadcrumb(config: BreadcrumbConfig): Breadcrumb {
  return new Breadcrumb(config);
}

let defaultInstance: Breadcrumb | null = null;

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

export async function trace(context: TraceContext = {}): Promise<TraceInstance> {
  return getInstance().trace(context);
}
