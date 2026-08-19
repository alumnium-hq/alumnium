#!/usr/bin/env bun

// This script prints a tree from a given web page URL.

import { chromium, devices } from "playwright";
import { Alumni } from "alumnium";
import { writeFile } from "node:fs/promises";
import { emitKeypressEvents } from "node:readline";
import { parseArgs } from "node:util";
import { ServerChromiumAccessibilityTree } from "../src/server/accessibility/ServerChromiumAccessibilityTree.ts";
import { Logger } from "../src/telemetry/Logger.ts";

const { url, raw, headed, pause, out } = args();

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext(devices["Desktop Chrome"]);
const page = await context.newPage();
await page.goto(url.toString(), { waitUntil: "networkidle" });

if (pause) await waitForKeypress();

Logger.level = "error";

const alumni = new Alumni(page);
const a11yTree = await alumni.driver.getAccessibilityTree();
const a11yXml = a11yTree.toStr();

if (raw) await end(a11yXml);

const tree = new ServerChromiumAccessibilityTree(a11yXml);
const xml = tree.toXml();

await end(xml);

async function end(xml: string): Promise<never> {
  if (out) await writeFile(out, xml);
  else console.log(xml);
  await browser.close();
  process.exit(0);
}

function args() {
  const {
    values: { raw, headed, pause, out },
    positionals: [urlStr, ...extraArgs],
  } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      raw: { type: "boolean" },
      headed: { type: "boolean" },
      pause: { type: "boolean" },
      out: { type: "string" },
    },
  });

  if (!urlStr) crash(`The <url> argument is required`);

  const url = URL.parse(urlStr);
  if (!url) crash(`The <url> argument ("${urlStr}") is invalid`);

  if (extraArgs.length) crash(`Unexpected extra argument: ${extraArgs[0]}`);

  return { url, raw: !!raw, headed: !!headed || !!pause, pause: !!pause, out };
}

async function waitForKeypress(): Promise<void> {
  if (!process.stdin.isTTY) crash("--pause requires an interactive terminal");
  console.error("Press any key to capture the accessibility tree...");

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  try {
    await new Promise<void>((resolve) =>
      process.stdin.once("keypress", resolve),
    );
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

function crash(msg: string): never {
  console.error(msg);
  process.exit(1);
}
