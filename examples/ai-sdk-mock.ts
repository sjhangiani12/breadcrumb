/**
 * AI SDK mock example - demonstrates the adapter without calling OpenAI
 *
 * Run: npx tsx examples/ai-sdk-mock.ts
 */

import { createBreadcrumb } from "../src/index.js";
import { memorySink } from "../src/sinks/memory.js";
import type { TraceInstance } from "../src/core/trace.js";

// Mock streamText result (simulates AI SDK response)
function mockStreamText(trace: TraceInstance) {
  return async (params: { messages: { role: string; content: string }[] }) => {
    // Log user message
    const lastMessage = params.messages[params.messages.length - 1];
    if (lastMessage?.role === "user") {
      await trace.userInput(lastMessage.content);
    }

    // Simulate tool calls
    await trace.toolCall("searchDatabase", "tc_1", { query: lastMessage.content });
    await trace.toolResult("searchDatabase", "tc_1", { results: ["Result 1", "Result 2"] });

    // Simulate response
    await trace.assistantResponse("Here's what I found based on your query...");

    return {
      text: "Here's what I found based on your query...",
      finishReason: Promise.resolve("stop"),
    };
  };
}

async function main() {
  const memory = memorySink();
  const bc = createBreadcrumb({ sinks: [memory] });

  console.log("Simulating AI SDK integration...\n");

  const trace = await bc.trace({ userId: "user_123" });

  // Use mock instead of real AI SDK
  const streamText = mockStreamText(trace);

  const result = await streamText({
    messages: [{ role: "user", content: "Find recent funding announcements" }],
  });

  await result.finishReason;
  await trace.end("completed");

  // Show results
  console.log("=== Trace Summary ===\n");

  const stored = memory.getTrace(trace.id);
  if (stored) {
    console.log(`Events captured: ${stored.events.length}`);
    for (const event of stored.events) {
      console.log(`  - ${event.type}: ${JSON.stringify(event.data).slice(0, 60)}...`);
    }
  }

  console.log("\n✅ AI SDK mock example complete!");
}

main().catch(console.error);
