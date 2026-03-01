import { vi } from "vitest";
import type { Sink, Trace, TraceEvent, TraceContext } from "../src/core/types.js";

export function createMockSink(name = "mock"): Sink & {
  onTraceStart: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  onTraceEnd: ReturnType<typeof vi.fn>;
} {
  return {
    name,
    onTraceStart: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockResolvedValue(undefined),
    onTraceEnd: vi.fn().mockResolvedValue(undefined),
  };
}

export function createContext(overrides: Partial<TraceContext> = {}): TraceContext {
  return {
    userId: "user-1",
    sessionId: "session-1",
    ...overrides,
  };
}
