import { describe, it, expect } from "vitest";
import { MemorySink } from "../../src/sinks/memory.js";
import type { Trace, TraceContext, TraceEvent } from "../../src/core/types.js";

function makTrace(id: string): Trace {
  return {
    id,
    status: "active",
    startedAt: new Date(),
    events: [],
    metadata: {},
  };
}

function makeEvent(traceId: string, type: "user_input" = "user_input"): TraceEvent {
  return {
    id: `evt-${Math.random()}`,
    traceId,
    type,
    timestamp: new Date(),
    data: { type: "user_input", content: "test" },
  };
}

const ctx: TraceContext = { userId: "u1", sessionId: "s1" };

describe("MemorySink", () => {
  it("stores and retrieves traces", async () => {
    const mem = new MemorySink();
    const trace = makTrace("t1");
    await mem.onTraceStart(trace, ctx);

    expect(mem.size).toBe(1);
    expect(mem.getTrace("t1")).toBeDefined();
    expect(mem.getTrace("t1")!.trace.id).toBe("t1");
  });

  it("stores events on the correct trace", async () => {
    const mem = new MemorySink();
    const trace = makTrace("t1");
    await mem.onTraceStart(trace, ctx);

    const event = makeEvent("t1");
    await mem.onEvent(trace, event);

    const stored = mem.getTrace("t1")!;
    expect(stored.events).toHaveLength(1);
  });

  it("evicts oldest trace when maxTraces is exceeded", async () => {
    const mem = new MemorySink({ maxTraces: 2 });

    await mem.onTraceStart(makTrace("t1"), ctx);
    await mem.onTraceStart(makTrace("t2"), ctx);
    await mem.onTraceStart(makTrace("t3"), ctx);

    expect(mem.size).toBe(2);
    expect(mem.getTrace("t1")).toBeUndefined();
    expect(mem.getTrace("t2")).toBeDefined();
    expect(mem.getTrace("t3")).toBeDefined();
  });

  it("returns traces newest first", async () => {
    const mem = new MemorySink();
    await mem.onTraceStart(makTrace("t1"), ctx);
    await mem.onTraceStart(makTrace("t2"), ctx);
    await mem.onTraceStart(makTrace("t3"), ctx);

    const traces = mem.getTraces();
    expect(traces[0].trace.id).toBe("t3");
    expect(traces[2].trace.id).toBe("t1");
  });

  it("filters traces by userId", async () => {
    const mem = new MemorySink();
    await mem.onTraceStart(makTrace("t1"), { userId: "alice" });
    await mem.onTraceStart(makTrace("t2"), { userId: "bob" });

    const aliceTraces = mem.getTracesByUser("alice");
    expect(aliceTraces).toHaveLength(1);
    expect(aliceTraces[0].trace.id).toBe("t1");
  });

  it("filters traces by sessionId", async () => {
    const mem = new MemorySink();
    await mem.onTraceStart(makTrace("t1"), { sessionId: "s1" });
    await mem.onTraceStart(makTrace("t2"), { sessionId: "s2" });

    const s1Traces = mem.getTracesBySession("s1");
    expect(s1Traces).toHaveLength(1);
  });

  it("clear() resets all state", async () => {
    const mem = new MemorySink();
    await mem.onTraceStart(makTrace("t1"), ctx);
    await mem.onTraceStart(makTrace("t2"), ctx);

    mem.clear();
    expect(mem.size).toBe(0);
    expect(mem.getTraces()).toHaveLength(0);
  });

  it("onEvent no-ops gracefully for unknown trace", async () => {
    const mem = new MemorySink();
    const event = makeEvent("nonexistent");
    // Should not throw
    await mem.onEvent(makTrace("nonexistent"), event);
    expect(mem.size).toBe(0);
  });

  it("onTraceEnd updates status and endedAt", async () => {
    const mem = new MemorySink();
    const trace = makTrace("t1");
    await mem.onTraceStart(trace, ctx);

    const endedTrace = { ...trace, status: "completed" as const, endedAt: new Date() };
    await mem.onTraceEnd(endedTrace);

    const stored = mem.getTrace("t1")!;
    expect(stored.trace.status).toBe("completed");
    expect(stored.trace.endedAt).toBeInstanceOf(Date);
  });
});
