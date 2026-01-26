import type {
  Trace,
  TraceEvent,
  TraceEventType,
  TraceContext,
  TraceStatus,
  Sink,
  UserInputData,
  AssistantResponseData,
  AssistantThinkingData,
  ToolCallData,
  ToolResultData,
  ErrorData,
  MetadataData,
} from "./types.js";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class TraceInstance implements Trace {
  public readonly id: string;
  public status: TraceStatus = "active";
  public readonly startedAt: Date;
  public endedAt?: Date;
  public readonly events: TraceEvent[] = [];
  public readonly metadata: Record<string, unknown>;

  private readonly sinks: Sink[];
  private readonly context: TraceContext;
  private readonly logErrors: boolean;
  private readonly customGenerateId: (() => string) | undefined;

  constructor(
    sinks: Sink[],
    context: TraceContext,
    options: { logErrors?: boolean; generateId?: () => string } = {}
  ) {
    this.sinks = sinks;
    this.context = context;
    this.logErrors = options.logErrors ?? true;
    this.customGenerateId = options.generateId;

    this.id = context.traceId ?? this.genId();
    this.startedAt = new Date();
    this.metadata = {
      ...context.metadata,
      userId: context.userId,
      sessionId: context.sessionId,
    };
  }

  private genId(): string {
    return this.customGenerateId?.() ?? generateId();
  }

  async start(): Promise<void> {
    await this.notifySinks("onTraceStart", this, this.context);
  }

  private async notifySinks<K extends keyof Sink>(
    method: K,
    ...args: Sink[K] extends (...args: infer P) => unknown ? P : never
  ): Promise<void> {
    await Promise.all(
      this.sinks.map(async (sink) => {
        try {
          // @ts-expect-error - TypeScript can't infer the spread correctly
          await sink[method](...args);
        } catch (error) {
          if (this.logErrors) {
            console.error(`[breadcrumb] Sink "${sink.name}" error in ${method}:`, error);
          }
        }
      })
    );
  }

  private async addEvent(
    type: TraceEventType,
    data: TraceEvent["data"]
  ): Promise<TraceEvent> {
    const event: TraceEvent = {
      id: this.genId(),
      traceId: this.id,
      type,
      timestamp: new Date(),
      data,
    };

    this.events.push(event);
    await this.notifySinks("onEvent", this, event);
    return event;
  }

  // Convenience methods for adding events

  async userInput(content: string): Promise<TraceEvent> {
    const data: UserInputData = { type: "user_input", content };
    return this.addEvent("user_input", data);
  }

  async assistantResponse(content: string, isPartial = false): Promise<TraceEvent> {
    const data: AssistantResponseData = {
      type: "assistant_response",
      content,
      isPartial,
    };
    return this.addEvent("assistant_response", data);
  }

  async assistantThinking(content: string): Promise<TraceEvent> {
    const data: AssistantThinkingData = { type: "assistant_thinking", content };
    return this.addEvent("assistant_thinking", data);
  }

  async toolCall(
    toolName: string,
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<TraceEvent> {
    const data: ToolCallData = { type: "tool_call", toolName, toolCallId, args };
    return this.addEvent("tool_call", data);
  }

  async toolResult(
    toolName: string,
    toolCallId: string,
    result: unknown
  ): Promise<TraceEvent> {
    const data: ToolResultData = { type: "tool_result", toolName, toolCallId, result };
    return this.addEvent("tool_result", data);
  }

  async error(message: string, stack?: string, code?: string): Promise<TraceEvent> {
    const data: ErrorData = { type: "error", message, stack, code };
    return this.addEvent("error", data);
  }

  async addMetadata(key: string, value: unknown): Promise<TraceEvent> {
    this.metadata[key] = value;
    const data: MetadataData = { type: "metadata", key, value };
    return this.addEvent("metadata", data);
  }

  async end(status: "completed" | "error" = "completed"): Promise<void> {
    this.status = status;
    this.endedAt = new Date();
    await this.notifySinks("onTraceEnd", this);
  }
}
