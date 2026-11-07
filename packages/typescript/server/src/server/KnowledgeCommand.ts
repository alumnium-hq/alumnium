import z from "zod";
import {
  KnowledgeLayer,
  KnowledgeRelevance,
  KnowledgeStore,
} from "@alumnium/core/agents";
import { AppId, CliCommand, Env } from "@alumnium/core/internal";

export namespace KnowledgeCommand {
  export type Args = z.infer<typeof KnowledgeCommand.Args>;

  /** Writes a line of output. */
  export type Print = (line: string) => void;
}

/**
 * Inspects and maintains lessons taught with `learn`.
 */
export abstract class KnowledgeCommand {
  static Args = z.object({
    action: z
      .enum(["list", "validate", "explain", "migrate"])
      .register(CliCommand.positional, {
        name: "action",
        syntax: "<action>",
        description: "list, validate, explain or migrate",
      }),

    instruction: z.string().optional().register(CliCommand.positional, {
      name: "instruction",
      syntax: "[instruction]",
      description: "Instruction to explain",
    }),

    scope: z.string().optional().register(CliCommand.option, {
      name: "scope",
      syntax: "--scope <scope>",
      description:
        "Knowledge scope (product or app id) to list, explain or migrate",
    }),

    app: z.string().optional().register(CliCommand.option, {
      name: "app",
      syntax: "--app <app>",
      description:
        "App id, host or URL to resolve the scope of when explaining",
    }),

    platform: KnowledgeLayer.Platform.default("web").register(
      CliCommand.option,
      {
        name: "platform",
        syntax: "--platform <platform>",
        description: "Platform to explain for: web, ios or android",
      },
    ),

    kind: z
      .enum(["do", "get", "check", "find", "area"])
      .default("do")
      .register(CliCommand.option, {
        name: "kind",
        syntax: "--kind <kind>",
        description: "Kind of lessons to explain: do, get, check, find or area",
      }),
  });

  static command = CliCommand.define({
    name: "knowledge",
    description: "Inspect and maintain lessons taught with learn",
    Args: KnowledgeCommand.Args,
    action: async ({ args }) => {
      const ok = await KnowledgeCommand.run(args, (line) => console.log(line));
      if (!ok) process.exit(1);
    },
  });

  /**
   * Runs the action, printing its output.
   *
   * @returns Whether it succeeded.
   */
  static async run(
    args: KnowledgeCommand.Args,
    print: KnowledgeCommand.Print,
  ): Promise<boolean> {
    const store = new KnowledgeStore();
    switch (args.action) {
      case "list":
        return KnowledgeCommand.#list(store, args, print);
      case "validate":
        return KnowledgeCommand.#validate(store, print);
      case "explain":
        return KnowledgeCommand.#explain(store, args, print);
      case "migrate":
        return KnowledgeCommand.#migrate(store, args, print);
    }
  }

  static async #list(
    store: KnowledgeStore,
    args: KnowledgeCommand.Args,
    print: KnowledgeCommand.Print,
  ): Promise<boolean> {
    const refs = (await store.layers()).filter(
      ({ scope }) => !args.scope || scope === null || scope === args.scope,
    );
    if (!refs.length) {
      print(`No lessons in ${store.dir}`);
      return true;
    }

    for (const { scope, layer } of refs) {
      print(scope === null ? layer : `${scope} (${layer})`);
      const lessons = await store.layer(scope, layer);
      for (const kind of KnowledgeStore.KINDS) {
        for (const [instruction, value] of lessons[kind]) {
          print(
            `  ${kind}  ${instruction}  →  ${KnowledgeCommand.#format(value)}`,
          );
        }
      }
    }
    return true;
  }

  static async #validate(
    store: KnowledgeStore,
    print: KnowledgeCommand.Print,
  ): Promise<boolean> {
    const problems = await store.validate();
    if (!problems.length) {
      print(`Knowledge in ${store.dir} is valid`);
      return true;
    }
    problems.forEach((problem) => print(problem));
    return false;
  }

  static async #explain(
    store: KnowledgeStore,
    args: KnowledgeCommand.Args,
    print: KnowledgeCommand.Print,
  ): Promise<boolean> {
    if (!args.instruction) {
      print("explain needs an instruction");
      return false;
    }

    let scope = args.scope ?? Env.ALUMNIUM_KNOWLEDGE_SCOPE ?? null;
    if (!scope && args.app) {
      const app = AppId.parse(args.app);
      scope = (await store.manifest()).resolve(app) ?? app;
    }
    if (!scope) {
      print("explain needs --scope or --app");
      return false;
    }

    const merged = new Map<string, { value: unknown; layer: string }>();
    for (const layer of KnowledgeLayer.applicable(args.platform)) {
      const lessons = await store.layer(scope, layer);
      for (const [instruction, value] of lessons[args.kind]) {
        merged.set(instruction, { value, layer });
      }
    }

    const selected = KnowledgeRelevance.select(
      merged,
      args.instruction,
      Env.ALUMNIUM_KNOWLEDGE_TOP_K,
    );
    print(
      `Scope ${scope}, platform ${args.platform}: ${selected.length} of ${merged.size} ${args.kind} lessons sent`,
    );
    for (const { instruction, value, score, exact } of selected) {
      const match = exact ? "exact" : score.toFixed(2);
      print(
        `  [${value.layer}] ${match}  ${instruction}  →  ${KnowledgeCommand.#format(value.value)}`,
      );
    }
    return true;
  }

  static async #migrate(
    store: KnowledgeStore,
    args: KnowledgeCommand.Args,
    print: KnowledgeCommand.Print,
  ): Promise<boolean> {
    const scopes = args.scope
      ? [args.scope]
      : (await store.layers())
          .filter(({ layer, scope }) => layer === "product" && scope !== null)
          .map(({ scope }) => scope as string);

    for (const scope of scopes) {
      const moved = await store.migrate(scope);
      if (moved) print(`${scope}: moved ${moved} lessons into lessons.json`);
    }
    return true;
  }

  static #format(value: unknown): string {
    return Array.isArray(value) ? value.join("; ") : String(value);
  }
}
