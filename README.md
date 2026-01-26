# breadcrumb 🍞

Drop breadcrumbs from your AI conversations. See every message, tool call, and response in Slack.

## Setup

```bash
npm install breadcrumb
npx breadcrumb slack
```

That's it. The CLI walks you through creating a Slack app and saves your config.

## Usage

```typescript
import { createBreadcrumb } from "breadcrumb";
import { slackSink } from "breadcrumb/sinks/slack";

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

```typescript
import { createBreadcrumb } from "breadcrumb";
import { slackSink } from "breadcrumb/sinks/slack";
import { wrapStreamText } from "breadcrumb/adapters/ai-sdk";
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

## What You See in Slack

```
🍞 New conversation started
User: user_123
Trace: m1abc-def456
│
├─ 👤 User
│  What's the weather?
│
├─ 🔧 Tool Call: get_weather
│  { "location": "NYC" }
│
├─ 📦 Tool Result: get_weather
│  { "temp": 72 }
│
├─ 🤖 Assistant
│  It's 72°F in NYC!
│
└─ ✅ Completed (2s)
```

## Sinks

### Slack

```bash
npx breadcrumb slack  # Interactive setup
```

Or manually:

```typescript
import { slackSink } from "breadcrumb/sinks/slack";

slackSink({
  token: "xoxb-...",
  channel: "#ai-traces",
  username: "Breadcrumb",     // optional
  iconEmoji: ":bread:",       // optional
});
```

### PostgreSQL

```typescript
import { postgresSink, createTablesSql } from "breadcrumb/sinks/postgres";

// Run once
await db.query(createTablesSql());

// Use
postgresSink({ client: db });
```

### Memory (dev/testing)

```typescript
import { memorySink } from "breadcrumb/sinks/memory";

const memory = memorySink();
// memory.getTraces(), memory.getTrace(id), memory.clear()
```

### Custom

```typescript
import type { Sink } from "breadcrumb";

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

## License

MIT
