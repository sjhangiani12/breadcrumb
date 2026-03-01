// Core exports
export {
  Breadcrumb,
  createBreadcrumb,
  init,
  getInstance,
  trace,
} from "./core/breadcrumb.js";

export { TraceInstance } from "./core/trace.js";

export type {
  Trace,
  TraceEvent,
  TraceEventType,
  TraceEventData,
  TraceContext,
  TraceStatus,
  Sink,
  BreadcrumbConfig,
  UserInputData,
  AssistantResponseData,
  AssistantThinkingData,
  ToolCallData,
  ToolResultData,
  ErrorData,
  MetadataData,
} from "./core/types.js";

export type { StoredTrace } from "./sinks/memory.js";
