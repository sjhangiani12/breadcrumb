import type { Sink, Trace, TraceEvent, TraceContext, TraceEventType } from "../core/types.js";

export interface SlackSinkConfig {
  /** Slack Bot OAuth token (xoxb-...) */
  token: string;
  /** Channel ID or name to post to */
  channel: string;
  /** Optional: Custom bot name */
  username?: string;
  /** Optional: Custom bot icon emoji */
  iconEmoji?: string;
  /** Optional: Custom bot icon URL */
  iconUrl?: string;
  /** Max chars per message chunk (default: 3500, Slack limit is ~4000) */
  maxChunkSize?: number;
  /** Event types to send to Slack. Defaults to all except tool_call and tool_result. */
  events?: TraceEventType[];
}

interface SlackMessage {
  ts: string;
  channel: string;
}

interface SlackResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

// Slack message limit is ~4000 chars, use 3500 to be safe
const DEFAULT_CHUNK_SIZE = 3500;

async function postMessage(
  token: string,
  params: Record<string, unknown>
): Promise<SlackResponse> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    // keepalive ensures request completes even if the function is shutting down
    keepalive: true,
  });
  return (await res.json()) as SlackResponse;
}

const DEFAULT_EVENTS: TraceEventType[] = [
  "user_input",
  "assistant_response",
  "assistant_thinking",
  "error",
  "metadata",
];

export class SlackSink implements Sink {
  public readonly name = "slack";
  private readonly config: SlackSinkConfig;
  private readonly maxChunkSize: number;
  private readonly events: Set<TraceEventType>;

  // Track thread message for each trace
  private threads: Map<string, SlackMessage> = new Map();

  constructor(config: SlackSinkConfig) {
    this.config = { ...config };
    this.maxChunkSize = config.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
    this.events = new Set(config.events ?? DEFAULT_EVENTS);
  }

  async onTraceStart(trace: Trace, context: TraceContext): Promise<void> {
    // Check if we already have a thread for this trace (conversation continuation)
    if (this.threads.has(trace.id)) {
      return;
    }

    // Build header with user info only
    const headerParts = [`:bread: *New conversation*`];
    if (context.userName || context.userEmail) {
      const userInfo = [context.userName, context.userEmail].filter(Boolean).join(" · ");
      headerParts.push(userInfo);
    } else if (context.userId) {
      headerParts.push(`User: ${context.userId}`);
    }

    const response = await postMessage(this.config.token, {
      channel: this.config.channel,
      text: headerParts.join("\n"),
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
      unfurl_links: false,
      unfurl_media: false,
    });

    if (response.ok && response.ts && response.channel) {
      this.threads.set(trace.id, { ts: response.ts, channel: response.channel });
    }
  }

  async onEvent(trace: Trace, event: TraceEvent): Promise<void> {
    const thread = this.threads.get(trace.id);
    if (!thread) return;

    if (!this.events.has(event.data.type)) return;

    const { header, content, isJson } = this.formatEvent(event);
    if (!header) return;

    // Format content with code block if JSON
    const formattedContent = isJson ? "```\n" + content + "\n```" : content;
    const fullMessage = `${header}\n${formattedContent}`;

    // If message fits in one chunk, send it
    if (fullMessage.length <= this.maxChunkSize) {
      await this.postToThread(thread, fullMessage);
      return;
    }

    // Otherwise, chunk it up
    // First, send the header
    await this.postToThread(thread, header);

    // Then send content in chunks
    const chunks = this.chunkContent(content, isJson);
    for (const chunk of chunks) {
      await this.postToThread(thread, chunk);
    }
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    // Only post summary if there was an error
    // Don't delete the thread - conversations may continue across requests
    if (trace.status === "error") {
      const thread = this.threads.get(trace.id);
      if (!thread) return;

      await this.postToThread(thread, `:x: *Error in conversation*`);
    }
    // Keep thread in memory for conversation continuation
  }

  private async postToThread(thread: SlackMessage, text: string): Promise<void> {
    await postMessage(this.config.token, {
      channel: thread.channel,
      thread_ts: thread.ts,
      text,
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  private chunkContent(content: string, isJson: boolean): string[] {
    const chunks: string[] = [];
    // Reserve space for code block markers if JSON
    const overhead = isJson ? 10 : 0; // "```\n" + "\n```"
    const chunkSize = this.maxChunkSize - overhead;

    let remaining = content;
    let chunkNum = 1;

    while (remaining.length > 0) {
      let chunk = remaining.slice(0, chunkSize);
      remaining = remaining.slice(chunkSize);

      // If there's more content, try to break at a newline for cleaner output
      if (remaining.length > 0) {
        const lastNewline = chunk.lastIndexOf("\n");
        if (lastNewline > chunkSize * 0.5) {
          // Only break at newline if it's in the second half
          remaining = chunk.slice(lastNewline + 1) + remaining;
          chunk = chunk.slice(0, lastNewline);
        }
      }

      // Wrap in code block if JSON
      const formatted = isJson ? "```\n" + chunk + "\n```" : chunk;
      chunks.push(formatted);
      chunkNum++;
    }

    return chunks;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
  }

  private formatArgValue(value: unknown): string {
    if (typeof value === "string") {
      return `"${this.truncate(value, 30)}"`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    if (value && typeof value === "object") {
      return `{...}`;
    }
    return String(value);
  }

  private summarizeArgs(args: Record<string, unknown>): string {
    const keys = Object.keys(args);
    if (keys.length === 0) return "(no args)";

    const parts: string[] = [];
    let totalLength = 0;
    const maxLen = 80;

    for (const key of keys) {
      const value = args[key];
      const valueStr = this.formatArgValue(value);
      const part = `${key}=${valueStr}`;

      if (totalLength + part.length > maxLen) {
        const remaining = keys.length - parts.length;
        if (remaining > 0) {
          parts.push(`+${remaining} more`);
        }
        break;
      }

      parts.push(part);
      totalLength += part.length + 2;
    }

    return parts.join(", ");
  }

  private summarizeResult(result: unknown): string {
    if (result === null || result === undefined) return "(no result)";

    if (typeof result === "string") {
      if (result.length === 0) return "(empty)";
      return this.truncate(result, 150);
    }

    if (typeof result === "number" || typeof result === "boolean") {
      return String(result);
    }

    if (Array.isArray(result)) {
      return this.summarizeArray(result);
    }

    if (typeof result === "object") {
      return this.summarizeObject(result as Record<string, unknown>);
    }

    return String(result);
  }

  private summarizeArray(arr: unknown[]): string {
    const count = arr.length;
    if (count === 0) return "[empty]";
    const itemWord = count === 1 ? "item" : "items";
    return `[${count} ${itemWord}]`;
  }

  private summarizeObject(obj: Record<string, unknown>): string {
    // Check for success/failure pattern
    if ("success" in obj || "ok" in obj) {
      const success = obj.success ?? obj.ok;
      if ("message" in obj && typeof obj.message === "string") {
        return `${success ? "success" : "failed"}: ${this.truncate(obj.message, 80)}`;
      }
      return success ? "success" : "failed";
    }

    // Check for error pattern
    if ("error" in obj && typeof obj.error === "string") {
      return `error: ${this.truncate(obj.error, 80)}`;
    }

    // Check for results/candidates array pattern
    for (const key of ["results", "candidates", "items", "data", "matches", "files"]) {
      if (key in obj && Array.isArray(obj[key])) {
        const arr = obj[key] as unknown[];
        return `${arr.length} ${key}`;
      }
    }

    // Check for count/total pattern
    if ("count" in obj || "total" in obj) {
      const count = obj.count ?? obj.total;
      return `count: ${count}`;
    }

    // Default: show keys
    const keys = Object.keys(obj);
    if (keys.length <= 3) {
      return `{${keys.join(", ")}}`;
    }
    return `{${keys.slice(0, 3).join(", ")}, +${keys.length - 3} more}`;
  }

  private formatEvent(event: TraceEvent): { header: string | null; content: string; isJson: boolean } {
    const data = event.data;

    switch (data.type) {
      case "user_input":
        return {
          header: `:bust_in_silhouette: *User*`,
          content: data.content,
          isJson: true,
        };

      case "assistant_response":
        if (data.isPartial) return { header: null, content: "", isJson: false };
        return {
          header: `:robot_face: *Assistant*`,
          content: data.content,
          isJson: true,
        };

      case "assistant_thinking":
        return {
          header: `:thought_balloon: *Thinking*`,
          content: data.content,
          isJson: true,
        };

      case "tool_call":
        return {
          header: `:hammer_and_wrench: *${data.toolName}*`,
          content: this.summarizeArgs(data.args),
          isJson: false,
        };

      case "tool_result":
        return {
          header: `:package: *${data.toolName}* result`,
          content: this.summarizeResult(data.result),
          isJson: false,
        };

      case "error":
        return {
          header: `:warning: *Error*`,
          content: `${data.message}${data.stack ? `\n\n${data.stack}` : ""}`,
          isJson: true,
        };

      case "metadata":
        return {
          header: `:label: *${data.key}*`,
          content: JSON.stringify(data.value, null, 2),
          isJson: true,
        };

      default:
        return { header: null, content: "", isJson: false };
    }
  }
}

/**
 * Create a Slack sink
 */
export function slackSink(config: SlackSinkConfig): SlackSink {
  return new SlackSink(config);
}
