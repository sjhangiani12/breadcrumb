# breadcrumb 🍞

Drop breadcrumbs from your AI conversations. See every message, tool call, and response in Slack.

## Setup

```bash
npm install breadcrumb-chat
npx breadcrumb slack
```

That's it. The CLI walks you through creating a Slack app and saves your config.

## Usage

```typescript
import { createBreadcrumb } from "breadcrumb-chat";
import { slackSink } from "breadcrumb-chat/sinks/slack";

const bc = createBreadcrumb({
  sinks: [
    slackSink({
      token: process.env.BREADCRUMB_SLACK_TOKEN,
      channel: process.env.BREADCRUMB_SLACK_CHANNEL,
    }),
  ],
});

// Start a trace
const trace = await bc.trace({ userId: "user_123" });

// Log events
await trace.userInput("What's the weather?");
await trace.toolCall("get_weather", "call_1", { location: "NYC" });
await trace.toolResult("get_weather", "call_1", { temp: 72 });
await trace.assistantResponse("It's 72°F in NYC!");

// Done
await trace.end();
```

## With Vercel AI SDK

### streamText

```typescript
import { createBreadcrumb } from "breadcrumb-chat";
import { slackSink } from "breadcrumb-chat/sinks/slack";
import { wrapStreamText } from "breadcrumb-chat/adapters/ai-sdk";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const bc = createBreadcrumb({
  sinks: [
    slackSink({
      token: process.env.BREADCRUMB_SLACK_TOKEN,
      channel: process.env.BREADCRUMB_SLACK_CHANNEL,
    }),
  ],
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const trace = await bc.trace({ userId: "user_123" });
  const traced = wrapStreamText(streamText, trace);

  const result = await traced({
    model: openai("gpt-4"),
    messages,
  });

  result.finishReason.then(() => trace.end());
  return result.toDataStreamResponse();
}
```

### generateText

```typescript
import { wrapGenerateText } from "breadcrumb-chat/adapters/ai-sdk";
import { generateText } from "ai";

const trace = await bc.trace({ userId: "user_123" });
const traced = wrapGenerateText(generateText, trace);

const result = await traced({
  model: openai("gpt-4"),
  messages: [{ role: "user", content: "Hello!" }],
});

await trace.end();
```

### createTracedStreamText

Auto-manages trace lifecycle — calls `trace.end()` when the stream finishes:

```typescript
import { createTracedStreamText } from "breadcrumb-chat/adapters/ai-sdk";

const tracedStreamText = createTracedStreamText(streamText, () =>
  bc.trace({ userId: "user_123" })
);

const result = await tracedStreamText({
  model: openai("gpt-4"),
  messages,
});
// trace.end() is called automatically when the stream finishes
```

## What You See in Slack

Each trace creates a Slack thread. The header message shows the user name, and each event is posted as a reply:

- 👤 **User** — the user's message
- 🤖 **Assistant** — the assistant's response
- 🔧 **Tool Call** — tool name and arguments
- 📦 **Tool Result** — tool output
- 💭 **Thinking** — assistant reasoning
- ⚠️ **Error** — error details

## Sinks

### Slack

```bash
npx breadcrumb slack  # Interactive setup
```

Or manually:

```typescript
import { slackSink } from "breadcrumb-chat/sinks/slack";

slackSink({
  token: "xoxb-...",
  channel: "#ai-traces",
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | required | Slack Bot OAuth token (`xoxb-...`) |
| `channel` | `string` | required | Channel ID or name |
| `username` | `string` | `undefined` | Custom bot display name |
| `iconEmoji` | `string` | `undefined` | Bot icon emoji (e.g. `":bread:"`) |
| `iconUrl` | `string` | `undefined` | Bot icon URL (alternative to emoji) |
| `events` | `TraceEventType[]` | all except `tool_call`, `tool_result` | Which event types to post |
| `verbosity` | `"concise" \| "verbose"` | `"concise"` | `"concise"` summarizes tool args/results inline; `"verbose"` posts full JSON |
| `maxChunkSize` | `number` | `3500` | Max characters per message (Slack limit is ~4000) |
| `timeoutMs` | `number` | `10000` | Timeout for Slack API calls in milliseconds |

### PostgreSQL

```typescript
import { postgresSink, createTablesSql } from "breadcrumb-chat/sinks/postgres";

// Run once to create tables
await db.query(createTablesSql());

// Create the sink
const sink = postgresSink({ client: db });

// Use it
const bc = createBreadcrumb({ sinks: [sink] });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `PostgresClient` | required | Any client with `.query(text, values?)` |
| `tracesTable` | `string` | `"breadcrumb_traces"` | Table name for traces |
| `eventsTable` | `string` | `"breadcrumb_events"` | Table name for events |
| `schema` | `string` | `"public"` | Database schema |

### Memory (dev/testing)

```typescript
import { memorySink } from "breadcrumb-chat/sinks/memory";

const memory = memorySink();
// memory.getTraces(), memory.getTrace(id), memory.clear()
// memory.getTracesByUser(userId), memory.getTracesBySession(sessionId)
```

### Custom

```typescript
import type { Sink } from "breadcrumb-chat";

const mySink: Sink = {
  name: "my-sink",
  async onTraceStart(trace, context) { },
  async onEvent(trace, event) { },
  async onTraceEnd(trace) { },
};
```

## API

```typescript
// Trace lifecycle
const trace = await bc.trace({ userId, sessionId, metadata });
await trace.end("completed" | "error");

// Events
await trace.userInput(content);
await trace.assistantResponse(content);
await trace.assistantThinking(content);
await trace.toolCall(name, id, args);
await trace.toolResult(name, id, result);
await trace.error(message, stack?, code?);
await trace.addMetadata(key, value);
```

> **Note:** Breadcrumb sends conversation content (user messages, assistant responses, tool arguments and results) to your configured sinks verbatim. Make sure your sinks comply with your data handling requirements.

## License

MIT
