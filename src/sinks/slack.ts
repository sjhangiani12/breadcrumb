import type { Sink, Trace, TraceEvent, TraceContext } from "../core/types.js";

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
  });
  return (await res.json()) as SlackResponse;
}

export class SlackSink implements Sink {
  public readonly name = "slack";
  private readonly config: SlackSinkConfig;

  // Track thread message for each trace
  private threads: Map<string, SlackMessage> = new Map();

  constructor(config: SlackSinkConfig) {
    this.config = {
      ...config,
    };
  }

  async onTraceStart(trace: Trace, context: TraceContext): Promise<void> {
    const headerParts = [`:bread: *New conversation started*`];
    if (context.userId) headerParts.push(`User: \`${context.userId}\``);
    if (context.sessionId) headerParts.push(`Session: \`${context.sessionId}\``);
    headerParts.push(`Trace: \`${trace.id}\``);
    headerParts.push(`_${trace.startedAt.toISOString()}_`);

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

    const formatted = this.formatEvent(event);
    if (!formatted) return;

    // Post each event as a separate message in the thread
    await postMessage(this.config.token, {
      channel: thread.channel,
      thread_ts: thread.ts,
      text: formatted,
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    const thread = this.threads.get(trace.id);
    if (!thread) return;

    const duration = trace.endedAt
      ? Math.round((trace.endedAt.getTime() - trace.startedAt.getTime()) / 1000)
      : 0;

    const statusEmoji = trace.status === "completed" ? ":white_check_mark:" : ":x:";
    const summary = `${statusEmoji} *Conversation ended*\nStatus: \`${trace.status}\`\nDuration: ${duration}s\nEvents: ${trace.events.length}`;

    await postMessage(this.config.token, {
      channel: thread.channel,
      thread_ts: thread.ts,
      text: summary,
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
    });

    // Cleanup
    this.threads.delete(trace.id);
  }

  private formatEvent(event: TraceEvent): string | null {
    const data = event.data;

    switch (data.type) {
      case "user_input":
        return `:bust_in_silhouette: *User*\n${this.truncate(data.content)}`;

      case "assistant_response":
        if (data.isPartial) return null; // Skip partial responses
        return `:robot_face: *Assistant*\n${this.truncate(data.content)}`;

      case "assistant_thinking":
        return `:thought_balloon: *Thinking*\n\`\`\`${this.truncate(data.content, 500)}\`\`\``;

      case "tool_call":
        return `:hammer_and_wrench: *Tool Call: ${data.toolName}*\n\`\`\`json\n${this.truncate(JSON.stringify(data.args, null, 2), 500)}\`\`\``;

      case "tool_result":
        const resultStr =
          typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
        return `:package: *Tool Result: ${data.toolName}*\n\`\`\`${this.truncate(resultStr, 500)}\`\`\``;

      case "error":
        return `:warning: *Error*\n\`${data.message}\`${data.stack ? `\n\`\`\`${this.truncate(data.stack, 300)}\`\`\`` : ""}`;

      case "metadata":
        return `:label: *${data.key}*: \`${JSON.stringify(data.value)}\``;

      default:
        return null;
    }
  }

  private truncate(text: string, maxLength = 1000): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "... (truncated)";
  }
}

/**
 * Create a Slack sink
 */
export function slackSink(config: SlackSinkConfig): SlackSink {
  return new SlackSink(config);
}
