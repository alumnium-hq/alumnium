#!/usr/bin/env bun

import { pascalCase } from "case-anything";
import fs from "node:fs/promises";
import path from "node:path";
import { format } from "oxfmt";
import {
  hashValue,
  normalizeForHash,
  type TypesScan,
} from "../src/utils/typesScan.ts";

type OutputMode = "module" | "class";

interface CliArgs {
  scanFilePath: string;
  noExactOptional: boolean;
  mode: OutputMode;
  className?: string;
}

interface SchemaDecl {
  name: string;
  expr: string;
}

const args = parseArgs(process.argv.slice(2));
const { scanFilePath, mode, noExactOptional } = args;
const raw = await fs.readFile(scanFilePath, "utf-8");
const parsed = JSON.parse(raw);
if (!Array.isArray(parsed)) {
  throw new TypeError("Type scan root must be an array");
}

const baseName = toPascalCase(deriveBaseName(scanFilePath));
const className = args.className ? toPascalCase(args.className) : baseName;
const generated = generateSchemas(parsed as TypesScan.NodeType[], {
  baseName,
  mode,
  className,
});
const formatted = await format("generated.ts", generated, {
  printWidth: 80,
});
if (formatted.errors.length) {
  for (const error of formatted.errors) console.error(error.message);
  process.exit(1);
}

process.stdout.write(formatted.code);

function parseArgs(args: string[]): CliArgs {
  let mode: OutputMode = "module";
  let className: string | undefined;
  let scanFilePath: string | undefined;
  let noExactOptional = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "--mode") {
      const next = args[i + 1];
      if (!next || (next !== "module" && next !== "class")) {
        throw new TypeError("--mode must be one of: module, class");
      }
      mode = next;
      i++;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value !== "module" && value !== "class") {
        throw new TypeError("--mode must be one of: module, class");
      }
      mode = value;
      continue;
    }

    if (arg === "--class-name") {
      const next = args[i + 1];
      if (!next) throw new TypeError("Missing value for --class-name");
      className = next;
      i++;
      continue;
    }

    if (arg.startsWith("--class-name=")) {
      className = arg.slice("--class-name=".length);
      continue;
    }

    if (arg === "--no-exact-optional") {
      noExactOptional = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new TypeError(`Unknown argument: ${arg}`);
    }

    if (!scanFilePath) {
      scanFilePath = arg;
      continue;
    }

    throw new TypeError(
      `Unexpected extra argument: ${arg} ${JSON.stringify(args)}`,
    );
  }

  if (!scanFilePath) {
    throw new TypeError(
      "Usage: generate-types-scan-schema.ts <scan-file.json> [--mode <module|class>] [--class-name <ClassName>]",
    );
  }

  if (mode !== "class" && className) {
    throw new TypeError("--class-name can only be used with --mode class");
  }

  if (className !== undefined) {
    return { scanFilePath, mode, className, noExactOptional };
  }

  return { scanFilePath, mode, noExactOptional };
}

function deriveBaseName(filePath: string): string {
  const base = path
    .basename(filePath)
    .replace(/\.types-scan\.json$/i, "")
    .replace(/\.type-scan\.json$/i, "")
    .replace(/\.scan\.json$/i, "")
    .replace(/\.json$/i, "");

  return base || "Generated";
}

function generateSchemas(
  root: TypesScan.NodeType[],
  options: { baseName: string; mode: OutputMode; className: string },
): string {
  const { baseName, mode, className } = options;
  const declarations: SchemaDecl[] = [];
  const usedNames = new Set<string>();
  const objectSchemaByHash: Record<string, string> = {};

  const rootName = toPascalCase(resolveRootName(root, baseName));
  const rootExpr = buildUnionExpr(root, [rootName]);
  if (rootExpr !== schemaRef(rootName)) {
    const rootSchemaName = uniqueName(rootName);
    declarations.push({ name: rootSchemaName, expr: rootExpr });
  }

  return mode === "module"
    ? renderModule(declarations)
    : renderClassMode(className, declarations);

  function buildUnionExpr(
    types: TypesScan.NodeType[],
    nameParts: string[],
  ): string {
    if (!Array.isArray(types) || !types.length) return "z.unknown()";
    if (types.length === 1) return buildTypeExpr(types[0]!, nameParts);

    const options = types.map((type, index) =>
      buildTypeExpr(type, [...nameParts, `Option${index + 1}`]),
    );
    return `z.union([${options.join(", ")}])`;
  }

  function buildTypeExpr(
    type: TypesScan.NodeType,
    nameParts: string[],
  ): string {
    const scopedNameParts = type.name ? [toPascalCase(type.name)] : nameParts;

    const baseExpr = buildTypeExprCore(type, scopedNameParts);
    return applyWipProfile(type.wip, baseExpr, [...scopedNameParts, "Wip"]);
  }

  function buildTypeExprCore(
    type: TypesScan.NodeType,
    nameParts: string[],
  ): string {
    if (type.kind === "unknown") return "z.unknown()";

    if (type.kind === "object") return defineObjectSchema(type, nameParts);
    if (type.kind === "array") return buildArrayExpr(type, nameParts);
    if (type.kind === "record") return buildRecordExpr(type, nameParts);
    return buildPrimitiveExpr(type);
  }

  function defineObjectSchema(
    node: TypesScan.NodeTypeObject,
    nameParts: string[],
  ): string {
    const hash = hashValue({ kind: "object", object: normalizeForHash(node) });
    const existing = objectSchemaByHash[hash];
    if (existing) return schemaRef(existing);

    const explicit = node.name ? toPascalCase(node.name) : null;
    const schemaName = uniqueName(explicit ?? nameParts.join(""));
    const expr = applyWipProfile(
      node.wip,
      buildObjectExpr(node, explicit ? [explicit] : nameParts),
      [...(explicit ? [explicit] : nameParts), "Wip"],
    );
    declarations.push({ name: schemaName, expr });
    objectSchemaByHash[hash] = schemaName;
    return schemaRef(schemaName);
  }

  function buildObjectExpr(
    node: TypesScan.NodeTypeObject,
    nameParts: string[],
  ): string {
    if (node.discriminator && Array.isArray(node.properties)) {
      const variants = node.properties.map((variant, index) =>
        defineObjectSchema(createVariantObjectNode(variant), [
          ...nameParts,
          `Variant${index + 1}`,
        ]),
      );
      if (!variants.length) return "z.object({})";
      return `z.discriminatedUnion(${JSON.stringify(node.discriminator)}, [${variants.join(", ")}])`;
    }

    if (Array.isArray(node.properties)) return "z.object({})";

    const fields = buildObjectShapeEntries(node.properties, nameParts);

    return `z.object({${fields.join(", ")}})`;
  }

  function createVariantObjectNode(
    variant: TypesScan.NodeTypeObject,
  ): TypesScan.NodeTypeObject {
    const node: TypesScan.NodeTypeObject = {
      kind: "object",
      properties: variant.properties,
    };

    if (variant.name?.trim()) node.name = variant.name;
    if (variant.wip !== undefined) node.wip = variant.wip;
    return node;
  }

  function applyWipProfile(
    wip: TypesScan.NodeTypeBase["wip"],
    baseExpr: string,
    nameParts: string[],
  ): string {
    if (!wip) return baseExpr;
    if (wip === true) return "z.unknown()";

    if (!Array.isArray(wip.type) || !wip.type.length) {
      throw new TypeError("wip.type must be a non-empty Type[]");
    }

    const wipExpr = buildUnionExpr(wip.type, [
      ...nameParts,
      toPascalCase(wip.kind),
    ]);
    if (wip.kind === "replace") return wipExpr;
    return `z.union([${baseExpr}, ${wipExpr}])`;
  }

  function buildObjectShapeEntries(
    properties: Record<string, TypesScan.NodeField>,
    nameParts: string[],
  ): string[] {
    return Object.entries(properties).map(([key, field]) => {
      const fieldRef = buildFieldExpr(field, [...nameParts, toPascalCase(key)]);
      const optional = field.optional && field.discriminator !== true;
      const optionalMethod = noExactOptional ? "optional" : "exactOptional";
      return `${JSON.stringify(key)}: ${optional ? `${fieldRef}.${optionalMethod}()` : fieldRef}`;
    });
  }

  function buildArrayExpr(
    node: TypesScan.NodeTypeArray,
    nameParts: string[],
  ): string {
    const itemRef = buildUnionExpr(node.type, [...nameParts, "Item"]);
    return `z.array(${itemRef})`;
  }

  function buildRecordExpr(
    node: TypesScan.NodeTypeRecord,
    nameParts: string[],
  ): string {
    const valueRef = Array.isArray(node.type)
      ? buildUnionExpr(node.type, [...nameParts, "Value"])
      : "z.unknown()";
    return `z.record(z.string(), ${valueRef})`;
  }

  function buildFieldExpr(
    field: TypesScan.NodeField,
    nameParts: string[],
  ): string {
    if (!field.discriminator) return buildUnionExpr(field.type, nameParts);
    return buildDiscriminatorFieldExpr(field.type);
  }

  function buildDiscriminatorFieldExpr(types: TypesScan.NodeType[]): string {
    if (types.length !== 1) {
      throw new TypeError(
        "Discriminator field must have exactly one type variant",
      );
    }

    const typeNode = types[0]!;
    if (
      typeNode.kind !== "string" &&
      typeNode.kind !== "number" &&
      typeNode.kind !== "boolean" &&
      typeNode.kind !== "null" &&
      typeNode.kind !== "undefined"
    ) {
      throw new TypeError(
        "Discriminator field type must be a primitive type node",
      );
    }

    if (typeNode.kind === "null") return "z.literal(null)";
    if (typeNode.kind === "undefined") return "z.literal(undefined)";

    if (!Array.isArray(typeNode.values) || typeNode.values.length !== 1) {
      throw new TypeError(
        "Discriminator primitive must have exactly one literal in values",
      );
    }

    return `z.literal(${literalValue(typeNode.values[0])})`;
  }

  function buildPrimitiveExpr(node: TypesScan.NodeTypePrimitive): string {
    if (node.kind === "null") return "z.null()";
    if (node.kind === "undefined") return "z.undefined()";

    if (node.kind === "string") {
      if (node.literal === false) return "z.string()";
      return buildLiteralUnionOrBase("string", node.values);
    }

    if (node.kind === "number") {
      if (node.literal === false) return "z.number()";
      return buildLiteralUnionOrBase("number", node.values);
    }

    if (node.literal === false) return "z.boolean()";
    return buildLiteralUnionOrBase("boolean", node.values);
  }

  function buildLiteralUnionOrBase(
    kind: "string" | "number" | "boolean",
    values: unknown,
  ): string {
    if (!Array.isArray(values) || !values.length) return `z.${kind}()`;

    const uniq = deduplicate(values);
    if (!uniq.length) return `z.${kind}()`;
    if (uniq.length === 1) return `z.literal(${literalValue(uniq[0])})`;

    const literals = uniq.map((value) => `z.literal(${literalValue(value)})`);
    return `z.union([${literals.join(", ")}])`;
  }

  function deduplicate(values: unknown[]): unknown[] {
    const seen = new Set<string>();
    const result: unknown[] = [];

    for (const value of values) {
      const key = JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }

    return result;
  }

  function literalValue(value: unknown): string {
    if (typeof value === "number") return literalNumber(value);
    if (typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }

  function literalNumber(value: number | undefined): string {
    if (typeof value !== "number") return "0";
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
    return String(value);
  }

  function uniqueName(raw: string): string {
    const cleaned = toPascalCase(raw);
    if (!usedNames.has(cleaned)) {
      usedNames.add(cleaned);
      return cleaned;
    }

    let suffix = 2;
    while (usedNames.has(`${cleaned}${suffix}`)) suffix++;
    const candidate = `${cleaned}${suffix}`;
    usedNames.add(candidate);
    return candidate;
  }

  function resolveRootName(
    types: TypesScan.NodeType[],
    fallback: string,
  ): string {
    if (types.length === 1 && types[0]?.name) return types[0].name;
    return fallback;
  }

  function schemaRef(name: string): string {
    return mode === "class" ? `this.${name}` : name;
  }

  function renderModule(items: SchemaDecl[]): string {
    const blocks = items
      .map(
        ({ name, expr }) =>
          `export const ${name} = ${expr};\n\nexport type ${name} = z.infer<typeof ${name}>;`,
      )
      .join("\n\n");

    return [
      "// This file is auto-generated by scripts/generate-types-scan-schema.ts. Do not edit it directly.",
      "",
      'import z from "zod";',
      "",
      blocks,
      "",
    ].join("\n");
  }

  function renderClassMode(name: string, items: SchemaDecl[]): string {
    const classBody = items
      .map(({ name: declName, expr }) => `  static ${declName} = ${expr};`)
      .join("\n\n");

    const namespaceBody = items
      .map(
        ({ name: declName }) =>
          `  export type ${declName} = z.infer<typeof ${name}.${declName}>;`,
      )
      .join("\n\n");

    return [
      "// This file is auto-generated by scripts/generate-types-scan-schema.ts. Do not edit it directly.",
      "",
      'import z from "zod";',
      "",
      `export abstract class ${name} {`,
      classBody,
      "}",
      "",
      `export namespace ${name} {`,
      namespaceBody,
      "}",
      "",
    ].join("\n");
  }
}

function toPascalCase(value: string): string {
  const result = pascalCase(value);
  return result || "Generated";
}
