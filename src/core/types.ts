/**
 * Core types for breadcrumb tracing
 */

export type TraceEventType =
  | "user_input"
  | "assistant_response"
  | "assistant_thinking"
  | "tool_call"
  | "tool_result"
  | "error"
  | "metadata";

export interface TraceEvent {
  id: string;
  traceId: string;
  type: TraceEventType;
  timestamp: Date;
  data: TraceEventData;
}

export type TraceEventData =
  | UserInputData
  | AssistantResponseData
  | AssistantThinkingData
  | ToolCallData
  | ToolResultData
  | ErrorData
  | MetadataData;

export interface UserInputData {
  type: "user_input";
  content: string;
}

export interface AssistantResponseData {
  type: "assistant_response";
  content: string;
  /** For streaming - is this a partial or final response */
  isPartial?: boolean;
}

export interface AssistantThinkingData {
  type: "assistant_thinking";
  content: string;
}

export interface ToolCallData {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface ToolResultData {
  type: "tool_result";
  toolName: string;
  toolCallId: string;
  result: unknown;
}

export interface ErrorData {
  type: "error";
  message: string;
  stack?: string;
  code?: string;
}

export interface MetadataData {
  type: "metadata";
  key: string;
  value: unknown;
}

export type TraceStatus = "active" | "completed" | "error";

export interface Trace {
  id: string;
  status: TraceStatus;
  startedAt: Date;
  endedAt?: Date;
  events: TraceEvent[];
  metadata: Record<string, unknown>;
}

/**
 * Context passed when creating a new trace
 */
export interface TraceContext {
  /** Optional trace ID - will be generated if not provided */
  traceId?: string;
  /** User identifier */
  userId?: string;
  /** Session or conversation identifier */
  sessionId?: string;
  /** Any additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Sink interface - implement this to send traces somewhere
 */
export interface Sink {
  name: string;

  /** Called when a new trace starts */
  onTraceStart(trace: Trace, context: TraceContext): Promise<void>;

  /** Called when an event is added to a trace */
  onEvent(trace: Trace, event: TraceEvent): Promise<void>;

  /** Called when a trace ends */
  onTraceEnd(trace: Trace): Promise<void>;
}

/**
 * Configuration for creating a breadcrumb instance
 */
export interface BreadcrumbConfig {
  /** Sinks to send trace data to */
  sinks: Sink[];
  /** Whether to log errors to console (default: true) */
  logErrors?: boolean;
  /** Generate custom trace IDs */
  generateId?: () => string;
}
