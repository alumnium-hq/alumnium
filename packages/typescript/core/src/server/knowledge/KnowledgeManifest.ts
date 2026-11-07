import { kebabCase } from "case-anything";
import z from "zod";
import { AppId } from "../../AppId.ts";

export namespace KnowledgeManifest {
  export type Value = z.infer<typeof KnowledgeManifest.Value>;
}

/**
 * Maps app ids to products, so builds of one product (web hosts, staging and
 * local environments, iOS and Android apps) share lessons. Read from
 * `knowledge.json` at the root of the knowledge directory:
 *
 * ```json
 * { "products": { "live-chat": { "apps": ["*.sprinklr.com", "com.sprinklr.chat"] } } }
 * ```
 *
 * An app entry is an app id, host or bundle id as drivers report it, or a glob
 * where `*` matches any part of it (`*.sprinklr.com`, `localhost:*`).
 */
export class KnowledgeManifest {
  /** Product name, also used as its directory name. */
  static Name = z
    .string()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
      "Knowledge scope must start with a letter or digit and contain only letters, digits, '.', '_' and '-'",
    );

  static Value = z.object({
    products: z.record(
      KnowledgeManifest.Name,
      z.object({ apps: z.array(z.string().min(1)).min(1) }),
    ),
  });

  static EMPTY = new KnowledgeManifest({ products: {} });

  #matchers: Array<{ product: string; entry: string; matches: RegExp }>;

  constructor(value: KnowledgeManifest.Value) {
    this.#matchers = Object.entries(value.products).flatMap(
      ([product, { apps }]) =>
        apps.map((entry) => ({
          product,
          entry,
          matches: KnowledgeManifest.#pattern(entry),
        })),
    );
  }

  /**
   * Parses the manifest JSON, naming the source in errors.
   */
  static parse(json: unknown, source: string): KnowledgeManifest {
    const result = KnowledgeManifest.Value.safeParse(json);
    if (!result.success) {
      throw new Error(
        `Invalid knowledge manifest ${source}: ${z.prettifyError(result.error)}`,
      );
    }
    return new KnowledgeManifest(result.data);
  }

  /**
   * Resolves the product the app belongs to, or `null` when no product claims
   * it. An app claimed by several products is a manifest error.
   */
  resolve(app: AppId): string | null {
    const claims = this.#matchers.filter(({ matches }) => matches.test(app));
    const products = [...new Set(claims.map(({ product }) => product))];
    if (products.length > 1) {
      const entries = claims.map(
        ({ product, entry }) => `"${entry}" (${product})`,
      );
      throw new Error(
        `App ${app} is claimed by several knowledge products: ${entries.join(", ")}`,
      );
    }
    return products.at(0) ?? null;
  }

  /**
   * Converts an app entry to a pattern over normalized app ids. Literal parts
   * are normalized like `AppId`, keeping separators next to `*`, so
   * `*.sprinklr.com` matches `live-chat-sprinklr-com` but not
   * `notsprinklr-com`.
   */
  static #pattern(entry: string): RegExp {
    if (!entry.includes("*")) {
      return new RegExp(`^${RegExp.escape(AppId.parse(entry))}$`);
    }

    const parts = entry.split("*").map((part) => {
      const words = kebabCase(part);
      if (!words) return part ? "-" : "";
      const before = /^[^A-Za-z0-9]/.test(part) ? "-" : "";
      const after = /[^A-Za-z0-9]$/.test(part) ? "-" : "";
      return RegExp.escape(`${before}${words}${after}`);
    });
    return new RegExp(`^${parts.join(".*")}$`);
  }
}
