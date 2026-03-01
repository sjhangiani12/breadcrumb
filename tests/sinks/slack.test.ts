import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlackSink } from "../../src/sinks/slack.js";
import type { Trace, TraceContext, TraceEvent } from "../../src/core/types.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

function slackOk(ts = "1234.5678", channel = "C123"): Response {
  return new Response(JSON.stringify({ ok: true, ts, channel }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function slackError(error = "channel_not_found"): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeTrace(id = "trace-1"): Trace {
  return { id, status: "active", startedAt: new Date(), events: [], metadata: {} };
}

function makeContext(): TraceContext {
  return { userId: "u1", userName: "Alice" };
}

function makeEvent(type: "user_input" = "user_input"): TraceEvent {
  return {
    id: "evt-1",
    traceId: "trace-1",
    type,
    timestamp: new Date(),
    data: { type: "user_input", content: "Hello!" },
  };
}

describe("SlackSink", () => {
  it("creates a thread on onTraceStart success", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });

    await sink.onTraceStart(makeTrace(), makeContext());

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.channel).toBe("C123");
    expect(body.text).toContain("Alice");
  });

  it("throws on onTraceStart failure", async () => {
    mockFetch.mockResolvedValueOnce(slackError("invalid_auth"));
    const sink = new SlackSink({ token: "xoxb-bad", channel: "C123" });

    await expect(sink.onTraceStart(makeTrace(), makeContext())).rejects.toThrow(
      "invalid_auth"
    );
  });

  it("posts events to thread after successful start", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onTraceStart(makeTrace(), makeContext());

    mockFetch.mockResolvedValueOnce(slackOk());
    await sink.onEvent(makeTrace(), makeEvent());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.thread_ts).toBe("1234.5678");
  });

  it("silently skips events when no thread exists (start failed)", async () => {
    // Don't call onTraceStart, so no thread exists
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onEvent(makeTrace(), makeEvent());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("filters events based on config", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({
      token: "xoxb-test",
      channel: "C123",
      events: ["user_input"], // only user_input, not tool_call
    });
    await sink.onTraceStart(makeTrace(), makeContext());

    // tool_call should be filtered out
    const toolEvent: TraceEvent = {
      id: "evt-2",
      traceId: "trace-1",
      type: "tool_call",
      timestamp: new Date(),
      data: { type: "tool_call", toolName: "search", toolCallId: "tc1", args: {} },
    };

    await sink.onEvent(makeTrace(), toolEvent);
    // Only the onTraceStart call, no event posted
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("warns on postToThread failure", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onTraceStart(makeTrace(), makeContext());

    mockFetch.mockResolvedValueOnce(slackError("too_many_attachments"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sink.onEvent(makeTrace(), makeEvent());
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("too_many_attachments")
    );
    warnSpy.mockRestore();
  });

  it("posts error footer on onTraceEnd with error status", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onTraceStart(makeTrace(), makeContext());

    mockFetch.mockResolvedValueOnce(slackOk());
    const trace = { ...makeTrace(), status: "error" as const };
    await sink.onTraceEnd(trace);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.text).toContain("Error in conversation");
  });

  it("does not post on onTraceEnd with completed status", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onTraceStart(makeTrace(), makeContext());

    const trace = { ...makeTrace(), status: "completed" as const };
    await sink.onTraceEnd(trace);

    // Only the onTraceStart call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips conversation continuation (existing thread)", async () => {
    mockFetch.mockResolvedValueOnce(slackOk());
    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onTraceStart(makeTrace(), makeContext());

    // Second start for same trace should be skipped
    await sink.onTraceStart(makeTrace(), makeContext());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on rate limit", async () => {
    const rateLimited = new Response(
      JSON.stringify({ ok: false, error: "ratelimited", retry_after: 0.01 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    mockFetch.mockResolvedValueOnce(rateLimited);
    mockFetch.mockResolvedValueOnce(slackOk());

    const sink = new SlackSink({ token: "xoxb-test", channel: "C123" });
    await sink.onTraceStart(makeTrace(), makeContext());

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
