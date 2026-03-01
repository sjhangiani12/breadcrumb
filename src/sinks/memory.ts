import type { Sink, Trace, TraceEvent, TraceContext } from "../core/types.js";

export interface MemorySinkConfig {
  /** Maximum number of traces to keep (default: 100) */
  maxTraces?: number;
}

export interface StoredTrace {
  trace: Trace;
  context: TraceContext;
  events: TraceEvent[];
}

export class MemorySink implements Sink {
  public readonly name = "memory";
  private readonly maxTraces: number;
  private traces: Map<string, StoredTrace> = new Map();
  private traceOrder: string[] = [];

  constructor(config: MemorySinkConfig = {}) {
    this.maxTraces = config.maxTraces ?? 100;
  }

  async onTraceStart(trace: Trace, context: TraceContext): Promise<void> {
    if (this.traces.size >= this.maxTraces && this.traceOrder.length > 0) {
      const oldestId = this.traceOrder.shift()!;
      this.traces.delete(oldestId);
    }

    this.traces.set(trace.id, {
      trace: { ...trace, events: [] },
      context,
      events: [],
    });
    this.traceOrder.push(trace.id);
  }

  async onEvent(trace: Trace, event: TraceEvent): Promise<void> {
    const stored = this.traces.get(trace.id);
    if (stored) {
      stored.events.push(event);
      stored.trace.events = stored.events;
    }
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    const stored = this.traces.get(trace.id);
    if (stored) {
      stored.trace.status = trace.status;
      stored.trace.endedAt = trace.endedAt;
      stored.trace.metadata = trace.metadata;
    }
  }

  getTraces(): StoredTrace[] { // newest first
    return Array.from(this.traces.values()).reverse();
  }

  getTrace(traceId: string): StoredTrace | undefined {
    return this.traces.get(traceId);
  }

  getTracesByUser(userId: string): StoredTrace[] {
    return this.getTraces().filter((t) => t.context.userId === userId);
  }

  getTracesBySession(sessionId: string): StoredTrace[] {
    return this.getTraces().filter((t) => t.context.sessionId === sessionId);
  }

  clear(): void {
    this.traces.clear();
    this.traceOrder = [];
  }

  get size(): number {
    return this.traces.size;
  }
}

export function memorySink(config: MemorySinkConfig = {}): MemorySink {
  return new MemorySink(config);
}
