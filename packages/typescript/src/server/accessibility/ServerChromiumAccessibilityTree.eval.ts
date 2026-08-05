import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import { nanoid } from "nanoid";
import type { AppId } from "../../AppId.ts";
import { Logger } from "../../telemetry/Logger.ts";
import { NullCache } from "../cache/NullCache.ts";
import { LlmContext } from "../LlmContext.ts";
import { LlmFactory } from "../LlmFactory.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { Env } from "../../Env.ts";
import { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import * as fs from "node:fs/promises";
import { ServerChromiumAccessibilityTree } from "./ServerChromiumAccessibilityTree.ts";

Logger.level = "warning";

evalite("ServerChromiumAccessibilityTree", {
  data: async () => {
    const [npmSearchResultsTree, githubPrTree] = await Promise.all([
      createTree("npm-search-results.xml"),
      createTree("github-pr.xml"),
    ]);

    return [
      {
        input: {
          statement:
            "the total number of found package links displayed on the page",
          treeXml: npmSearchResultsTree.toXml(),
          title: "ai - npm search",
          url: "https://www.npmjs.com/search?q=ai",
          screenshot: null,
        },
        expected: "20",
      },

      {
        input: {
          statement: "7a86bde commit title",
          treeXml: githubPrTree.toXml(),
          title:
            "Migrate server & MCP to TypeScript by kossnocorp · Pull Request #256 · alumnium-hq/alumnium",
          url: "https://github.com/alumnium-hq/alumnium/pull/256",
          screenshot: null,
        },
        expected: "Adopt TypeScript Project References feature",
      },

      {
        input: {
          statement:
            "how many checks passed for 606110d388068c823a03fe3c920b75a15a919d16 commit",
          treeXml: githubPrTree.toXml(),
          title:
            "Migrate server & MCP to TypeScript by kossnocorp · Pull Request #256 · alumnium-hq/alumnium",
          url: "https://github.com/alumnium-hq/alumnium/pull/256",
          screenshot: null,
        },
        expected: "0",
      },
    ];
  },

  scorers: [
    {
      name: "Gives correct answer",
      description: "Checks correctness of the retrieved information.",
      scorer: ({ output, expected }) => {
        const parsed = RetrieverAgent.Output.safeParse(output);
        if (!parsed.success) return 0;
        return parsed.data[1] === expected ? 1 : 0;
      },
    },
  ],

  trialCount: Env.ALUMNIUM_EVAL_TRIAL_COUNT,

  columns: ({ output, expected, traces }) => {
    const parsed = RetrieverAgent.Output.safeParse(output);
    const usage = traces.at(-1)?.usage;
    const stats = traces.at(-1)?.output as
      | {
          stats?: {
            cache_creation: number;
            cache_read: number;
            reasoning: number;
          };
        }
      | undefined;
    return [
      { label: "Expected", value: expected },
      {
        label: "Value",
        value: parsed.data?.[1] ?? "-",
      },
      {
        label: "Explanation",
        value: parsed.data?.[0] ?? "-",
      },
      { label: "Input tokens", value: usage?.inputTokens ?? "-" },
      { label: "Output tokens", value: usage?.outputTokens ?? "-" },
      { label: "Total tokens", value: usage?.totalTokens ?? "-" },
      { label: "Cache creation", value: stats?.stats?.cache_creation ?? "-" },
      { label: "Cache read", value: stats?.stats?.cache_read ?? "-" },
      { label: "Reasoning tokens", value: stats?.stats?.reasoning ?? "-" },
    ];
  },

  task: runRetriever,
});

async function runRetriever(input: RetrieverAgent.Props) {
  const model = Env.ALUMNIUM_MODEL;
  const llmContext = new LlmContext(model);
  const sessionContext = new SessionContext({
    app: "eval" as AppId,
    sessionId: nanoid(),
  });
  const cache = new NullCache(sessionContext);
  const llm = LlmFactory.createLlm(model, cache);
  const agent = new RetrieverAgent(llmContext, llm);

  const start = performance.now();
  const result = await agent.invoke(input);
  const end = performance.now();
  reportTrace({
    input,
    output: { result, stats: agent.usage },
    usage: {
      inputTokens: agent.usage.input_tokens,
      outputTokens: agent.usage.output_tokens,
      totalTokens: agent.usage.total_tokens,
    },
    start,
    end,
  });
  return result;
}

async function createTree(
  fixtureName: string,
): Promise<ServerChromiumAccessibilityTree> {
  const npmSearchFixture = new URL(
    `./__fixtures__/eval/${fixtureName}`,
    import.meta.url,
  );
  const npmSearchA11yXml = await fs.readFile(npmSearchFixture, "utf-8");
  const tree = new ServerChromiumAccessibilityTree(npmSearchA11yXml);
  return tree;
}
