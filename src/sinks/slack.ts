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
          header: `:hammer_and_wrench: *Tool Call: ${data.toolName}*`,
          content: JSON.stringify(data.args, null, 2),
          isJson: true,
        };

      case "tool_result":
        const resultStr =
          typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
        return {
          header: `:package: *Tool Result: ${data.toolName}*`,
          content: resultStr,
          isJson: true,
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
