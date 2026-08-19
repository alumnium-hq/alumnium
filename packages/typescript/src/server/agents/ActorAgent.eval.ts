import { evalite } from "evalite";
import { nanoid } from "nanoid";
import * as fs from "node:fs/promises";
import type { AppId } from "../../AppId.ts";
import { Env } from "../../Env.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { ToolCall } from "../../tools/BaseTool.ts";
import { ClickTool } from "../../tools/ClickTool.ts";
import { DragAndDropTool } from "../../tools/DragAndDropTool.ts";
import { HoverTool } from "../../tools/HoverTool.ts";
import { PressKeyTool } from "../../tools/PressKeyTool.ts";
import { TypeTool } from "../../tools/TypeTool.ts";
import { UploadTool } from "../../tools/UploadTool.ts";
import { convertToolsToSchemas } from "../../tools/toolToSchemaConverter.ts";
import { NullCache } from "../cache/NullCache.ts";
import { LlmContext } from "../LlmContext.ts";
import { LlmFactory } from "../LlmFactory.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { ActorAgent } from "./ActorAgent.ts";

Logger.level = "warning";

interface Input {
  goal: string;
  step: string;
  treeXml: string;
}

// NOTE: Mirrors `PlaywrightDriver#supportedTools`. It's an instance field and
// constructing a driver opens a CDP session, so the Chromium tool set is
// spelled out here instead of being read from the driver.
const toolSchemas = convertToolsToSchemas({
  ClickTool,
  DragAndDropTool,
  HoverTool,
  PressKeyTool,
  TypeTool,
  UploadTool,
});

evalite<Input, ActorAgent.InvokeResult, ToolCall[]>("ActorAgent", {
  data: async () => {
    const selectOption =
      'change the "Send money to" combobox selection to "Seller"';

    return [
      {
        input: {
          goal: selectOption,
          step: selectOption,
          treeXml: await readTree("chrome/support-order-refund.xml"),
        },
        // Ensure we click on the correct option, not the combobox itself.
        expected: [{ name: "ClickTool", args: { id: 757 } }],
      },
    ];
  },

  scorers: [
    {
      name: "Selects the correct option",
      description: "Checks the expected option element is clicked.",
      scorer: ({ output, expected }) => {
        const [, toolCalls] = output;
        const expectedCalls = new Set(formatToolCalls(expected));
        return toolCalls.some((toolCall) =>
          expectedCalls.has(formatToolCall(toolCall)),
        )
          ? 1
          : 0;
      },
    },
  ],

  trialCount: Env.ALUMNIUM_EVAL_TRIAL_COUNT,

  columns: ({ output, expected }) => {
    const [explanation, toolCalls] = output;
    return [
      { label: "Expected", value: formatToolCalls(expected).join(", ") },
      { label: "Tools", value: formatToolCalls(toolCalls).join(", ") || "-" },
      { label: "Explanation", value: explanation || "-" },
    ];
  },

  task: async ({ goal, step, treeXml }) => {
    const model = Env.ALUMNIUM_MODEL;
    const llmContext = new LlmContext(model);
    const sessionContext = new SessionContext({
      app: "eval" as AppId,
      sessionId: nanoid(),
    });
    const cache = new NullCache(sessionContext);
    const llm = LlmFactory.createLlm(model, cache);
    const agent = new ActorAgent(llmContext, llm, toolSchemas);

    return agent.invoke(goal, step, treeXml);
  },
});

async function readTree(fixtureName: string): Promise<string> {
  const fixture = new URL(
    `./__fixtures__/eval/${fixtureName}`,
    import.meta.url,
  );
  return fs.readFile(fixture, "utf-8");
}

function formatToolCalls(toolCalls: ToolCall[] | undefined): string[] {
  return (toolCalls ?? []).map(formatToolCall);
}

function formatToolCall({ name, args }: ToolCall): string {
  const argsStr = Object.entries(args)
    .map(([key, value]) => `${key}='${String(value)}'`)
    .join(", ");
  return `${name}(${argsStr})`;
}
