# breadcrumb 🍞

Drop breadcrumbs from your AI conversations. Track every message, tool call, and response in Slack and your database.

## Install

```bash
npm install breadcrumb
# or
pnpm add breadcrumb
```

## Quick Start

```typescript
import { createBreadcrumb } from "breadcrumb";
import { slackSink } from "breadcrumb/sinks/slack";
import { postgresSink } from "breadcrumb/sinks/postgres";

// Create a breadcrumb instance with your sinks
const bc = createBreadcrumb({
  sinks: [
    slackSink({
      token: process.env.SLACK_BOT_TOKEN,
      channel: "#ai-logs",
    }),
    postgresSink({
      client: db, // your postgres client
    }),
  ],
});

// Start a trace when a user starts chatting
const trace = await bc.trace({
  userId: "user_123",
  sessionId: "session_456",
});

// Log events as they happen
await trace.userInput("What's the weather like?");
await trace.toolCall("get_weather", "call_1", { location: "NYC" });
await trace.toolResult("get_weather", "call_1", { temp: 72, condition: "sunny" });
await trace.assistantResponse("The weather in NYC is 72°F and sunny!");

// End the trace when done
await trace.end();
```

## AI SDK Integration

Works seamlessly with Vercel's AI SDK:

```typescript
import { createBreadcrumb } from "breadcrumb";
import { slackSink } from "breadcrumb/sinks/slack";
import { wrapStreamText } from "breadcrumb/adapters/ai-sdk";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const bc = createBreadcrumb({
  sinks: [slackSink({ token: process.env.SLACK_BOT_TOKEN, channel: "#ai-logs" })],
});

// In your API route
export async function POST(req: Request) {
  const { messages } = await req.json();

  // Start a trace
  const trace = await bc.trace({ userId: req.headers.get("x-user-id") });

  // Wrap streamText to automatically trace everything
  const tracedStreamText = wrapStreamText(streamText, trace);

  const result = await tracedStreamText({
    model: openai("gpt-4"),
    messages,
    tools: { /* your tools */ },
  });

  // End trace when stream completes
  result.finishReason.then(() => trace.end());

  return result.toDataStreamResponse();
}
```

## Sinks

### Slack

Posts conversations to a Slack channel as threads:

```typescript
import { slackSink } from "breadcrumb/sinks/slack";

slackSink({
  token: process.env.SLACK_BOT_TOKEN,  // xoxb-...
  channel: "#ai-logs",                  // channel name or ID
  username: "AI Trace Bot",             // optional
  iconEmoji: ":bread:",                 // optional
  realTimeUpdates: true,                // update thread in real-time (default: true)
  updateDebounceMs: 1000,               // debounce updates (default: 1000ms)
});
```

Requires `@slack/web-api`:
```bash
npm install @slack/web-api
```

### PostgreSQL

Stores traces in your database:

```typescript
import { postgresSink, createTablesSql } from "breadcrumb/sinks/postgres";

// Run migrations first
await db.query(createTablesSql());

// Then use the sink
postgresSink({
  client: db,                          // any pg-compatible client
  schema: "public",                    // optional (default: "public")
  tracesTable: "breadcrumb_traces",    // optional
  eventsTable: "breadcrumb_events",    // optional
});
```

### Memory

In-memory storage for testing/development:

```typescript
import { memorySink } from "breadcrumb/sinks/memory";

const memory = memorySink({ maxTraces: 100 });

// Query traces
memory.getTraces();                    // all traces
memory.getTrace("trace_id");           // specific trace
memory.getTracesByUser("user_123");    // by user
memory.getTracesBySession("sess_456"); // by session
memory.clear();                        // clear all
```

## Event Types

```typescript
trace.userInput(content: string)
trace.assistantResponse(content: string, isPartial?: boolean)
trace.assistantThinking(content: string)
trace.toolCall(toolName: string, toolCallId: string, args: object)
trace.toolResult(toolName: string, toolCallId: string, result: any)
trace.error(message: string, stack?: string, code?: string)
trace.addMetadata(key: string, value: any)
trace.end(status?: "completed" | "error")
```

## Custom Sinks

Implement the `Sink` interface:

```typescript
import type { Sink, Trace, TraceEvent, TraceContext } from "breadcrumb";

const customSink: Sink = {
  name: "my-sink",

  async onTraceStart(trace: Trace, context: TraceContext) {
    // Called when a new trace starts
  },

  async onEvent(trace: Trace, event: TraceEvent) {
    // Called for each event
  },

  async onTraceEnd(trace: Trace) {
    // Called when trace ends
  },
};
```

## Singleton Pattern

For simpler usage across your app:

```typescript
import { init, trace } from "breadcrumb";
import { slackSink } from "breadcrumb/sinks/slack";

// Initialize once at startup
init({
  sinks: [slackSink({ token: "...", channel: "#ai-logs" })],
});

// Use anywhere
const t = await trace({ userId: "user_123" });
await t.userInput("Hello!");
await t.end();
```

## License

MIT
