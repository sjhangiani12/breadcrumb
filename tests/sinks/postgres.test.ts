import { describe, it, expect, vi } from "vitest";
import { PostgresSink } from "../../src/sinks/postgres.js";
import type { Trace, TraceEvent, TraceContext } from "../../src/core/types.js";

function mockClient() {
  return { query: vi.fn().mockResolvedValue(undefined) };
}

function makeTrace(id = "t1"): Trace {
  return { id, status: "active", startedAt: new Date(), events: [], metadata: { userId: "u1" } };
}

const ctx: TraceContext = { userId: "u1", sessionId: "s1" };

function makeEvent(): TraceEvent {
  return {
    id: "evt-1",
    traceId: "t1",
    type: "user_input",
    timestamp: new Date(),
    data: { type: "user_input", content: "test" },
  };
}

describe("PostgresSink", () => {
  it("inserts trace on onTraceStart", async () => {
    const client = mockClient();
    const sink = new PostgresSink({ client });
    const trace = makeTrace();

    await sink.onTraceStart(trace, ctx);

    expect(client.query).toHaveBeenCalledOnce();
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO");
    expect(sql).toContain('"public"."breadcrumb_traces"');
    expect(values[0]).toBe("t1");
    expect(values[3]).toBe("u1"); // userId
    expect(values[4]).toBe("s1"); // sessionId
  });

  it("inserts event on onEvent", async () => {
    const client = mockClient();
    const sink = new PostgresSink({ client });
    const event = makeEvent();

    await sink.onEvent(makeTrace(), event);

    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain('"public"."breadcrumb_events"');
    expect(values[0]).toBe("evt-1");
    expect(values[1]).toBe("t1"); // trace_id
    expect(values[2]).toBe("user_input");
  });

  it("updates trace on onTraceEnd", async () => {
    const client = mockClient();
    const sink = new PostgresSink({ client });
    const trace = { ...makeTrace(), status: "completed" as const, endedAt: new Date() };

    await sink.onTraceEnd(trace);

    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain("UPDATE");
    expect(values[0]).toBe("completed");
    expect(values[3]).toBe("t1"); // WHERE id
  });

  it("uses custom schema and table names", async () => {
    const client = mockClient();
    const sink = new PostgresSink({
      client,
      schema: "analytics",
      tracesTable: "my_traces",
      eventsTable: "my_events",
    });

    await sink.onTraceStart(makeTrace(), ctx);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain('"analytics"."my_traces"');
  });

  it("handles null userId and sessionId", async () => {
    const client = mockClient();
    const sink = new PostgresSink({ client });

    await sink.onTraceStart(makeTrace(), {});

    const [, values] = client.query.mock.calls[0];
    expect(values[3]).toBeNull(); // userId
    expect(values[4]).toBeNull(); // sessionId
  });
});
