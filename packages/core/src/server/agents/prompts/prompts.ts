import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Model } from "../../../Model.js";
import type { Agent } from "../Agent.js";

//#region Types

export type AgentPrompts = {
  [Kind in Agent.Kind]: AgentPrompts.DevPrompts;
};

export namespace AgentPrompts {
  export type DevPrompts = {
    [DevId: string]: RolePrompts;
  };

  export type RolePrompts = {
    [Role_ in Role]: string;
  };

  export type Role = "system" | "user";

  export type ProviderToDev = {
    [Provider in Model.Provider]: Model.Dev;
  };
}

//#endregion

//#region Consts

export const PROVIDER_TO_PROMPTS_DEV: AgentPrompts.ProviderToDev = {
  anthropic: "anthropic",
  aws_anthropic: "anthropic",
  google: "google",
  deepseek: "deepseek",
  aws_meta: "meta",
  mistralai: "mistralai",
  ollama: "ollama",
  xai: "xai",
  azure_foundry: "openai",
  azure_openai: "openai",
  github: "openai",
  openai: "openai",
};

//#endregion

//#region loadAgentPrompts

export async function loadAgentPrompts(): Promise<AgentPrompts> {
  const prompts: Partial<AgentPrompts> = {};

  const curFilePath = fileURLToPath(import.meta.url);
  const rootDirPath = path.dirname(curFilePath);

  const agentDirs = await getDirs(rootDirPath);

  await Promise.all(
    agentDirs.map(async (agentDir) => {
      const agentKind = agentDir.name as Agent.Kind;
      const agentPrompts = (prompts[agentKind] ??= {});

      const devDirs = await getDirs(agentDir.path);
      await Promise.all(
        devDirs.map(async (devDir) => {
          const [user, system] = await Promise.all([
            loadPrompt(devDir.path, "user"),
            loadPrompt(devDir.path, "system"),
          ]);
          agentPrompts[devDir.name] = { user, system };
        }),
      );
    }),
  );

  return prompts as AgentPrompts;
}

namespace GetDirs {
  export interface Entry {
    name: string;
    path: string;
  }
}

async function getDirs(parentDir: string): Promise<GetDirs.Entry[]> {
  const entries = await fs.readdir(parentDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(parentDir, entry.name),
    }));
}

function loadPrompt(devDir: string, role: AgentPrompts.Role): Promise<string> {
  const promptPath = path.join(devDir, `${role}.md`);
  try {
    return fs.readFile(promptPath, "utf-8");
  } catch (err) {
    throw new AggregateError([err], `Failed to read file '${promptPath}'`);
  }
}

//#endregion

//#region agentClassNameToPromptsAgentKind

export function agentClassNameToPromptsAgentKind(
  className: string,
): Agent.Kind {
  // Convert CamelCase to snake_case (e.g., ChangesAnalyzer -> changes_analyzer)
  const kind = className
    .replace(/Agent$/, "")
    .replace(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, "-")
    .toLowerCase();
  return kind as Agent.Kind;
}

//#endregion
