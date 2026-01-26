/**
 * Slack example - test breadcrumb with real Slack integration
 *
 * Setup:
 *   npx breadcrumb slack
 *
 * Run:
 *   npx tsx examples/with-slack.ts
 */

import { createBreadcrumb } from "../src/index.js";
import { slackSink } from "../src/sinks/slack.js";

async function main() {
  const token = process.env.BREADCRUMB_SLACK_TOKEN;
  const channel = process.env.BREADCRUMB_SLACK_CHANNEL;

  if (!token || !channel) {
    console.error("Missing environment variables!");
    console.error("Run: npx breadcrumb slack");
    console.error("Or set BREADCRUMB_SLACK_TOKEN and BREADCRUMB_SLACK_CHANNEL");
    process.exit(1);
  }

  console.log(`Sending trace to Slack channel: ${channel}\n`);

  const bc = createBreadcrumb({
    sinks: [
      slackSink({
        token,
        channel,
        iconEmoji: ":bread:",
      }),
    ],
  });

  const trace = await bc.trace({
    userId: "test_user",
    sessionId: "test_session",
  });

  console.log(`Trace started: ${trace.id}`);

  // Simulate a multi-turn conversation
  await trace.userInput("What companies in my portfolio raised funding recently?");
  console.log("✓ User input sent");

  await sleep(500);

  await trace.toolCall("getPortfolioCompanies", "call_1", { limit: 10 });
  console.log("✓ Tool call sent");

  await sleep(300);

  await trace.toolResult("getPortfolioCompanies", "call_1", [
    { id: "acme", name: "Acme Corp" },
    { id: "globex", name: "Globex Inc" },
  ]);
  console.log("✓ Tool result sent");

  await sleep(500);

  await trace.toolCall("getPortfolioFeed", "call_2", {
    types: ["fundraising"],
    limit: 5,
  });
  console.log("✓ Second tool call sent");

  await sleep(300);

  await trace.toolResult("getPortfolioFeed", "call_2", [
    {
      company: "Acme Corp",
      type: "fundraising",
      title: "Raised $10M Series A",
      date: "2024-01-15",
    },
  ]);
  console.log("✓ Second tool result sent");

  await sleep(500);

  await trace.assistantResponse(
    "Based on your portfolio data, Acme Corp recently raised a $10M Series A round on January 15th, 2024."
  );
  console.log("✓ Response sent");

  await trace.end("completed");
  console.log("✓ Trace ended");

  console.log("\n✅ Check your Slack channel for the trace thread!");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
