import { describe, it, expect, vi } from "vitest";
import { TraceInstance } from "../../src/core/trace.js";
import { createMockSink, createContext } from "../helpers.js";

describe("TraceInstance", () => {
  it("generates a unique id", () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    expect(trace.id).toBeTruthy();
    expect(typeof trace.id).toBe("string");
  });

  it("uses provided traceId from context", () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext({ traceId: "custom-id" }));
    expect(trace.id).toBe("custom-id");
  });

  it("uses custom generateId function", () => {
    const sink = createMockSink();
    let counter = 0;
    const trace = new TraceInstance([sink], createContext(), {
      generateId: () => `custom-${++counter}`,
    });
    expect(trace.id).toBe("custom-1");
  });

  it("calls onTraceStart on all sinks", async () => {
    const sink1 = createMockSink("s1");
    const sink2 = createMockSink("s2");
    const ctx = createContext();
    const trace = new TraceInstance([sink1, sink2], ctx);
    await trace.start();

    expect(sink1.onTraceStart).toHaveBeenCalledOnce();
    expect(sink2.onTraceStart).toHaveBeenCalledOnce();
    expect(sink1.onTraceStart).toHaveBeenCalledWith(trace, ctx);
  });

  it("emits events to all sinks in order", async () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    await trace.start();

    await trace.userInput("hello");
    await trace.assistantResponse("world");

    expect(sink.onEvent).toHaveBeenCalledTimes(2);
    const firstEvent = sink.onEvent.mock.calls[0][1];
    const secondEvent = sink.onEvent.mock.calls[1][1];
    expect(firstEvent.data.type).toBe("user_input");
    expect(secondEvent.data.type).toBe("assistant_response");
  });

  it("stores events on the trace", async () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    await trace.start();
    await trace.userInput("test");

    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].data.type).toBe("user_input");
  });

  it("isolates sink errors - one failing sink does not block others", async () => {
    const badSink = createMockSink("bad");
    badSink.onEvent.mockRejectedValue(new Error("sink failure"));
    const goodSink = createMockSink("good");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const trace = new TraceInstance([badSink, goodSink], createContext());
    await trace.start();
    await trace.userInput("test");

    expect(goodSink.onEvent).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("suppresses console output when logErrors is false", async () => {
    const badSink = createMockSink("bad");
    badSink.onTraceStart.mockRejectedValue(new Error("fail"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const trace = new TraceInstance([badSink], createContext(), { logErrors: false });
    await trace.start();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("throws when adding events after end()", async () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    await trace.start();
    await trace.end();

    await expect(trace.userInput("too late")).rejects.toThrow("trace is already completed");
  });

  it("sets status and endedAt on end()", async () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    await trace.start();
    await trace.end("error");

    expect(trace.status).toBe("error");
    expect(trace.endedAt).toBeInstanceOf(Date);
  });

  it("calls onTraceEnd on all sinks", async () => {
    const sink1 = createMockSink("s1");
    const sink2 = createMockSink("s2");
    const trace = new TraceInstance([sink1, sink2], createContext());
    await trace.start();
    await trace.end();

    expect(sink1.onTraceEnd).toHaveBeenCalledOnce();
    expect(sink2.onTraceEnd).toHaveBeenCalledOnce();
  });

  it("traces all event types correctly", async () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    await trace.start();

    await trace.userInput("hi");
    await trace.assistantResponse("hello", false);
    await trace.assistantThinking("hmm");
    await trace.toolCall("search", "tc1", { query: "test" });
    await trace.toolResult("search", "tc1", { results: [] });
    await trace.error("oops", "stack", "ERR_1");
    await trace.addMetadata("key", "value");

    expect(sink.onEvent).toHaveBeenCalledTimes(7);
    const types = sink.onEvent.mock.calls.map(
      (c: [unknown, { data: { type: string } }]) => c[1].data.type
    );
    expect(types).toEqual([
      "user_input",
      "assistant_response",
      "assistant_thinking",
      "tool_call",
      "tool_result",
      "error",
      "metadata",
    ]);
  });

  it("stores metadata on the trace object", async () => {
    const sink = createMockSink();
    const trace = new TraceInstance([sink], createContext());
    await trace.start();
    await trace.addMetadata("model", "gpt-4");

    expect(trace.metadata.model).toBe("gpt-4");
  });
});
