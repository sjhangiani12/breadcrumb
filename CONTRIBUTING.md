# Contributing to Breadcrumb

Thanks for wanting to contribute!

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run linter
npm run lint

# Run basic example
npm run example

# Run Slack example (needs setup first)
npx breadcrumb slack
npm run example:slack
```

## Adding a New Sink

1. Create a new file in `src/sinks/`
2. Implement the `Sink` interface:

```typescript
import type { Sink, Trace, TraceEvent, TraceContext } from "../core/types.js";

export class MySink implements Sink {
  name = "my-sink";

  async onTraceStart(trace: Trace, context: TraceContext) {
    // Called when trace starts
  }

  async onEvent(trace: Trace, event: TraceEvent) {
    // Called for each event
  }

  async onTraceEnd(trace: Trace) {
    // Called when trace ends
  }
}

export function mySink(config: MyConfig): MySink {
  return new MySink(config);
}
```

3. Add export to `package.json` exports field
4. Update README

## Pull Requests

1. Fork the repo
2. Create a branch
3. Make your changes
4. Run `npm test` and `npm run lint`
5. Run `npm run build` to ensure it compiles
6. Submit a PR

## Ideas for Contributions

- New sinks (Discord, webhook, Datadog, etc.)
- New adapters (Anthropic SDK, LangChain, etc.)
- Trace viewer UI
- Better formatting options
- Documentation improvements
