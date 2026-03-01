import type { TraceInstance } from "../core/trace.js";

/**
 * AI SDK adapter for breadcrumb-chat
 *
 * Wraps Vercel AI SDK's streamText/generateText to automatically trace:
 * - User messages
 * - Assistant responses
 * - Tool calls and results
 * - Errors
 *
 * @example
 * ```typescript
 * import { createBreadcrumb } from "breadcrumb-chat";
 * import { wrapStreamText } from "breadcrumb-chat/adapters/ai-sdk";
 * import { streamText } from "ai";
 *
 * const bc = createBreadcrumb({ sinks: [slackSink({ ... })] });
 * const trace = await bc.trace({ userId: "user123" });
 *
 * const wrapped = wrapStreamText(streamText, trace);
 * const result = await wrapped({
 *   model: openai("gpt-4"),
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 * ```
 */

interface AIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | Array<{ type: string; text?: string; toolCallId?: string; result?: unknown }>;
}

interface AIToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface AIToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

interface StreamTextResult {
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<StreamPart>;
  text: Promise<string>;
  toolCalls: Promise<AIToolCall[]>;
  toolResults: Promise<AIToolResult[]>;
  finishReason: Promise<string>;
  usage: Promise<{ promptTokens: number; completionTokens: number }>;
}

type StreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "reasoning"; textDelta: string }
  | { type: "error"; error: Error }
  | { type: "finish"; finishReason: string; usage: { promptTokens: number; completionTokens: number } };

interface StreamTextParams {
  model: unknown;
  messages: AIMessage[];
  tools?: Record<string, unknown>;
  [key: string]: unknown;
}

type StreamTextFn = (params: StreamTextParams) => Promise<StreamTextResult>;

export function wrapStreamText(
  streamText: StreamTextFn,
  trace: TraceInstance
): StreamTextFn {
  return async (params: StreamTextParams): Promise<StreamTextResult> => {
    const lastMessage = params.messages[params.messages.length - 1];
    if (lastMessage?.role === "user") {
      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : lastMessage.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
      await trace.userInput(content);
    }

    try {
      const result = await streamText(params);

      const originalFullStream = result.fullStream;
      const tracedFullStream = traceFullStream(originalFullStream, trace);

      return {
        ...result,
        fullStream: tracedFullStream,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await trace.error(err.message, err.stack);
      throw error;
    }
  };
}

async function* traceFullStream(
  stream: AsyncIterable<StreamPart>,
  trace: TraceInstance
): AsyncIterable<StreamPart> {
  let fullText = "";
  let reasoningText = "";

  try {
    for await (const part of stream) {
      switch (part.type) {
        case "text-delta":
          fullText += part.textDelta;
          break;

        case "reasoning":
          reasoningText += part.textDelta;
          break;

        case "tool-call":
          await trace.toolCall(part.toolName, part.toolCallId, part.args);
          break;

        case "tool-result":
          await trace.toolResult(part.toolName, part.toolCallId, part.result);
          break;

        case "error":
          await trace.error(part.error.message, part.error.stack);
          break;

        case "finish":
          if (reasoningText) {
            await trace.assistantThinking(reasoningText);
          }
          if (fullText) {
            await trace.assistantResponse(fullText);
          }
          break;
      }

      yield part;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await trace.error(err.message, err.stack);
    throw error;
  }
}

export function createTracedStreamText(
  streamText: StreamTextFn,
  getTrace: () => Promise<TraceInstance>
): (params: StreamTextParams) => Promise<StreamTextResult & { trace: TraceInstance }> {
  return async (params) => {
    const trace = await getTrace();
    const wrapped = wrapStreamText(streamText, trace);
    const result = await wrapped(params);

    result.finishReason.then(
      async () => await trace.end("completed"),
      async () => await trace.end("error")
    );

    return { ...result, trace };
  };
}

export function wrapGenerateText<
  T extends (params: { messages: AIMessage[]; [key: string]: unknown }) => Promise<{
    text: string;
    toolCalls?: AIToolCall[];
    toolResults?: AIToolResult[];
    reasoning?: string;
  }>
>(generateText: T, trace: TraceInstance): T {
  return (async (params) => {
    const lastMessage = params.messages[params.messages.length - 1];
    if (lastMessage?.role === "user") {
      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : String(lastMessage.content);
      await trace.userInput(content);
    }

    try {
      const result = await generateText(params);

      if (result.toolCalls) {
        for (const tc of result.toolCalls) {
          await trace.toolCall(tc.toolName, tc.toolCallId, tc.args);
        }
      }

      if (result.toolResults) {
        for (const tr of result.toolResults) {
          await trace.toolResult(tr.toolName, tr.toolCallId, tr.result);
        }
      }

      if (result.reasoning) {
        await trace.assistantThinking(result.reasoning);
      }

      if (result.text) {
        await trace.assistantResponse(result.text);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await trace.error(err.message, err.stack);
      throw error;
    }
  }) as T;
}
