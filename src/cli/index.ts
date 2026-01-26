#!/usr/bin/env node

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";

const SLACK_MANIFEST = `display_information:
  name: Breadcrumb
  description: AI conversation traces in Slack
  background_color: "#D2691E"
features:
  bot_user:
    display_name: Breadcrumb
    always_online: false
oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false`;

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`);
}

function info(msg: string) {
  console.log(`${COLORS.cyan}→${COLORS.reset} ${msg}`);
}

function header(msg: string) {
  console.log(`\n${COLORS.bright}${msg}${COLORS.reset}\n`);
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${COLORS.yellow}?${COLORS.reset} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (Y/n)`);
  return answer.toLowerCase() !== "n";
}

async function validateSlackToken(token: string): Promise<{ ok: boolean; team?: string; error?: string }> {
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = await res.json() as { ok: boolean; team?: string; error?: string };
    return data;
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function sendTestMessage(token: string, channel: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: "🍞 Breadcrumb connected! Traces will appear here.",
      }),
    });
    return await res.json() as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

function openBrowser(url: string) {
  const platform = process.platform;

  if (platform === "darwin") {
    exec(`open "${url}"`);
  } else if (platform === "win32") {
    exec(`start "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

function appendToEnv(key: string, value: string) {
  const envPath = path.join(process.cwd(), ".env");
  const line = `${key}=${value}\n`;

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    if (content.includes(`${key}=`)) {
      // Replace existing
      const updated = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
      fs.writeFileSync(envPath, updated);
    } else {
      // Append
      fs.appendFileSync(envPath, line);
    }
  } else {
    fs.writeFileSync(envPath, line);
  }
}

async function setupSlack() {
  header("🍞 Breadcrumb → Slack Setup");

  log("This will create a Slack app in your workspace.\n");

  // Step 1: Create app
  info("Step 1: Create the Slack app\n");

  const manifestEncoded = encodeURIComponent(SLACK_MANIFEST);
  const createUrl = `https://api.slack.com/apps?new_app=1&manifest_yaml=${manifestEncoded}`;

  log("  Opening Slack in your browser...");
  log("  If it doesn't open, go to:\n");
  log(`  ${COLORS.dim}${createUrl.slice(0, 80)}...${COLORS.reset}\n`);

  openBrowser(createUrl);

  await prompt("Press Enter once you've created the app...");

  // Step 2: Install & get token
  info("\nStep 2: Install the app & copy your token\n");
  log("  1. Click 'Install to Workspace' (left sidebar → Install App)");
  log("  2. Click 'Allow'");
  log("  3. Copy the 'Bot User OAuth Token' (starts with xoxb-)\n");

  const token = await prompt("Paste your token:");

  if (!token.startsWith("xoxb-")) {
    log("\n❌ Token should start with 'xoxb-'. Try again.");
    return;
  }

  // Validate
  log("\n  Validating token...");
  const validation = await validateSlackToken(token);

  if (!validation.ok) {
    log(`\n❌ Invalid token: ${validation.error}`);
    return;
  }

  success(`Connected to workspace: ${validation.team}`);

  // Step 3: Channel
  info("\nStep 3: Choose a channel\n");
  const channel = await prompt("Channel for traces (e.g. #ai-traces):");

  // Test message
  log("\n  Sending test message...");
  const test = await sendTestMessage(token, channel);

  if (!test.ok) {
    log(`\n❌ Couldn't post to ${channel}: ${test.error}`);
    log("  Make sure the channel exists and is public, or invite the bot first.");
    return;
  }

  success(`Test message sent to ${channel}`);

  // Step 4: Save
  info("\nStep 4: Save configuration\n");

  if (await confirm("Save to .env file?")) {
    appendToEnv("BREADCRUMB_SLACK_TOKEN", token);
    appendToEnv("BREADCRUMB_SLACK_CHANNEL", channel);
    success("Saved to .env");
  } else {
    log("\n  Add these to your environment:\n");
    log(`  BREADCRUMB_SLACK_TOKEN=${token}`);
    log(`  BREADCRUMB_SLACK_CHANNEL=${channel}`);
  }

  // Done
  header("✅ Slack setup complete!");

  log("Usage:\n");
  log(`  ${COLORS.dim}import { createBreadcrumb } from "breadcrumb";`);
  log(`  import { slackSink } from "breadcrumb/sinks/slack";`);
  log(``);
  log(`  const bc = createBreadcrumb({`);
  log(`    sinks: [`);
  log(`      slackSink({`);
  log(`        token: process.env.BREADCRUMB_SLACK_TOKEN,`);
  log(`        channel: process.env.BREADCRUMB_SLACK_CHANNEL,`);
  log(`      }),`);
  log(`    ],`);
  log(`  });${COLORS.reset}\n`);
}

async function showUsage() {
  log(`
${COLORS.bright}🍞 Breadcrumb CLI${COLORS.reset}

Usage:
  npx breadcrumb <command>

Commands:
  slack    Set up Slack integration
  help     Show this help

Examples:
  npx breadcrumb slack   # Interactive Slack setup
`);
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "slack":
      await setupSlack();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      await showUsage();
      break;
    default:
      log(`Unknown command: ${command}`);
      await showUsage();
      process.exit(1);
  }
}

main().catch(console.error);
