import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Dev, Provider } from "../../../Model.js";

//#region Types

export type AgentPrompts = {
  [AgentId: AgentPrompts.AgentId]: AgentPrompts.DevPrompts;
};

export namespace AgentPrompts {
  export type AgentId = string & { [agentIdBrand]: true };
  declare const agentIdBrand: unique symbol;

  export type DevPrompts = {
    [DevId: string]: RolePrompts;
  };

  export type RolePrompts = {
    [Role_ in Role]: string;
  };

  export type Role = "system" | "user";

  export type ProviderToDev = {
    [Provider_ in Provider]: Dev;
  };
}

//#endregion

//#region Consts

export const PROVIDER_TO_PROMPTS_DEV: AgentPrompts.ProviderToDev = {
  [Provider.ANTHROPIC]: "anthropic",
  [Provider.AWS_ANTHROPIC]: "anthropic",
  [Provider.GOOGLE]: "google",
  [Provider.DEEPSEEK]: "deepseek",
  [Provider.AWS_META]: "meta",
  [Provider.MISTRALAI]: "mistralai",
  [Provider.OLLAMA]: "ollama",
  [Provider.XAI]: "xai",
  [Provider.AZURE_FOUNDRY]: "openai",
  [Provider.AZURE_OPENAI]: "openai",
  [Provider.GITHUB]: "openai",
  [Provider.OPENAI]: "openai",
};

//#endregion

//#region loadAgentPrompts

export async function loadAgentPrompts(): Promise<AgentPrompts> {
  const prompts: AgentPrompts = {};

  const curFilePath = fileURLToPath(import.meta.url);
  const rootDirPath = path.dirname(curFilePath);

  const agentDirs = await getDirs(rootDirPath);

  await Promise.all(
    agentDirs.map(async (agentDir) => {
      const agentId = agentDir.name as AgentPrompts.AgentId;
      const agentPrompts = (prompts[agentId] ??= {});

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

  return prompts;
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

//#region agentClassNameToPromptsAgentId

export function agentClassNameToPromptsAgentId(
  className: string,
): AgentPrompts.AgentId {
  // Convert CamelCase to snake_case (e.g., ChangesAnalyzer -> changes_analyzer)
  const agentId = className
    .replace(/Agent$/, "")
    .replace(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, "-")
    .toLowerCase() as AgentPrompts.AgentId;
  return agentId;
}

//#endregion
