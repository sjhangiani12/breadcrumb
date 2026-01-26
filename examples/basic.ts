/**
 * Basic example - test breadcrumb with memory sink (no external services needed)
 *
 * Run: npx tsx examples/basic.ts
 */

import { createBreadcrumb } from "../src/index.js";
import { memorySink } from "../src/sinks/memory.js";

async function main() {
  // Create breadcrumb with memory sink (for testing)
  const memory = memorySink();
  const bc = createBreadcrumb({ sinks: [memory] });

  // Simulate a conversation
  console.log("Starting trace...\n");

  const trace = await bc.trace({
    userId: "user_123",
    sessionId: "session_456",
    metadata: { source: "example" },
  });

  console.log(`Trace ID: ${trace.id}\n`);

  // Simulate events
  await trace.userInput("What's the weather in NYC?");
  console.log("✓ User input logged");

  await trace.toolCall("get_weather", "call_1", { location: "NYC" });
  console.log("✓ Tool call logged");

  await trace.toolResult("get_weather", "call_1", {
    temperature: 72,
    condition: "sunny",
    humidity: 45,
  });
  console.log("✓ Tool result logged");

  await trace.assistantThinking("User wants weather info. I have the data from the tool.");
  console.log("✓ Thinking logged");

  await trace.assistantResponse("The weather in NYC is 72°F and sunny with 45% humidity.");
  console.log("✓ Response logged");

  await trace.end("completed");
  console.log("✓ Trace ended\n");

  // Query the memory sink
  console.log("=== Stored Traces ===\n");

  const traces = memory.getTraces();
  for (const t of traces) {
    console.log(`Trace: ${t.trace.id}`);
    console.log(`Status: ${t.trace.status}`);
    console.log(`User: ${t.context.userId}`);
    console.log(`Duration: ${t.trace.endedAt!.getTime() - t.trace.startedAt.getTime()}ms`);
    console.log(`Events: ${t.events.length}`);
    console.log("\nEvent timeline:");

    for (const event of t.events) {
      const data = event.data;
      switch (data.type) {
        case "user_input":
          console.log(`  👤 User: "${data.content.slice(0, 50)}..."`);
          break;
        case "tool_call":
          console.log(`  🔧 Tool: ${data.toolName}(${JSON.stringify(data.args)})`);
          break;
        case "tool_result":
          console.log(`  📦 Result: ${JSON.stringify(data.result).slice(0, 50)}...`);
          break;
        case "assistant_thinking":
          console.log(`  💭 Thinking: "${data.content.slice(0, 50)}..."`);
          break;
        case "assistant_response":
          console.log(`  🤖 Assistant: "${data.content.slice(0, 50)}..."`);
          break;
      }
    }
  }

  console.log("\n✅ Example complete!");
}

main().catch(console.error);
