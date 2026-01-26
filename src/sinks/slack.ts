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
  /** Whether to update messages in real-time (default: true) */
  realTimeUpdates?: boolean;
  /** Debounce interval for updates in ms (default: 1000) */
  updateDebounceMs?: number;
}

interface SlackMessage {
  ts: string;
  channel: string;
}

// Minimal type for Slack WebClient
interface SlackWebClient {
  chat: {
    postMessage: (args: Record<string, unknown>) => Promise<{ ts?: string; channel?: string }>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
}

async function getSlackClient(token: string): Promise<SlackWebClient> {
  try {
    // Dynamic import - use string concatenation to prevent TS from resolving at compile time
    const moduleName = "@slack/web-api";
    const slack = await (Function(`return import("${moduleName}")`)() as Promise<{
      WebClient: new (token: string) => SlackWebClient;
    }>);
    return new slack.WebClient(token);
  } catch {
    throw new Error(
      "[breadcrumb] @slack/web-api is required for Slack sink. Install it with: npm install @slack/web-api"
    );
  }
}

export class SlackSink implements Sink {
  public readonly name = "slack";
  private readonly config: SlackSinkConfig;
  private client: SlackWebClient | null = null;

  // Track thread message for each trace
  private threads: Map<string, SlackMessage> = new Map();
  // Track pending updates to debounce
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  // Track current content for each trace (for building thread summary)
  private traceContent: Map<string, string[]> = new Map();

  constructor(config: SlackSinkConfig) {
    this.config = {
      realTimeUpdates: true,
      updateDebounceMs: 1000,
      ...config,
    };
  }

  private async getClient(): Promise<SlackWebClient> {
    if (!this.client) {
      this.client = await getSlackClient(this.config.token);
    }
    return this.client;
  }

  async onTraceStart(trace: Trace, context: TraceContext): Promise<void> {
    const client = await this.getClient();

    const headerParts = [`:bread: *New conversation started*`];
    if (context.userId) headerParts.push(`User: \`${context.userId}\``);
    if (context.sessionId) headerParts.push(`Session: \`${context.sessionId}\``);
    headerParts.push(`Trace: \`${trace.id}\``);
    headerParts.push(`_${trace.startedAt.toISOString()}_`);

    const response = await client.chat.postMessage({
      channel: this.config.channel,
      text: headerParts.join("\n"),
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
      unfurl_links: false,
      unfurl_media: false,
    });

    if (response.ts && response.channel) {
      this.threads.set(trace.id, { ts: response.ts, channel: response.channel });
      this.traceContent.set(trace.id, []);
    }
  }

  async onEvent(trace: Trace, event: TraceEvent): Promise<void> {
    const thread = this.threads.get(trace.id);
    if (!thread) return;

    const content = this.traceContent.get(trace.id) ?? [];
    const formatted = this.formatEvent(event);
    if (formatted) {
      content.push(formatted);
      this.traceContent.set(trace.id, content);
    }

    if (this.config.realTimeUpdates) {
      this.scheduleUpdate(trace.id);
    }
  }

  private scheduleUpdate(traceId: string): void {
    // Cancel any pending update
    const existing = this.pendingUpdates.get(traceId);
    if (existing) clearTimeout(existing);

    // Schedule a new update
    const timeout = setTimeout(() => {
      this.flushUpdate(traceId);
      this.pendingUpdates.delete(traceId);
    }, this.config.updateDebounceMs);

    this.pendingUpdates.set(traceId, timeout);
  }

  private async flushUpdate(traceId: string): Promise<void> {
    const thread = this.threads.get(traceId);
    const content = this.traceContent.get(traceId);
    if (!thread || !content || content.length === 0) return;

    const client = await this.getClient();

    // Post as a reply in the thread
    await client.chat.postMessage({
      channel: thread.channel,
      thread_ts: thread.ts,
      text: content.join("\n\n"),
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
      unfurl_links: false,
      unfurl_media: false,
    });

    // Clear content after posting
    this.traceContent.set(traceId, []);
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    // Flush any remaining content
    const pending = this.pendingUpdates.get(trace.id);
    if (pending) clearTimeout(pending);
    await this.flushUpdate(trace.id);

    const thread = this.threads.get(trace.id);
    if (!thread) return;

    const client = await this.getClient();

    const duration = trace.endedAt
      ? Math.round((trace.endedAt.getTime() - trace.startedAt.getTime()) / 1000)
      : 0;

    const statusEmoji = trace.status === "completed" ? ":white_check_mark:" : ":x:";
    const summary = `${statusEmoji} *Conversation ended*\nStatus: \`${trace.status}\`\nDuration: ${duration}s\nEvents: ${trace.events.length}`;

    await client.chat.postMessage({
      channel: thread.channel,
      thread_ts: thread.ts,
      text: summary,
      username: this.config.username,
      icon_emoji: this.config.iconEmoji,
      icon_url: this.config.iconUrl,
    });

    // Cleanup
    this.threads.delete(trace.id);
    this.traceContent.delete(trace.id);
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
        const resultStr = typeof data.result === "string"
          ? data.result
          : JSON.stringify(data.result, null, 2);
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
