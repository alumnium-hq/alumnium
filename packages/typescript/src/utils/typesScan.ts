/**
 * See //docs/contributing/types-scan.md for details and usage instructions.
 */

import fs from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import { canonize } from "smolcanon";
import { xxh64Str } from "smolxxh/str";

export namespace TypesScan {
  export type Node = NodeType | NodeField;

  export type NodeType =
    | NodeTypeObject
    | NodeTypeArray
    | NodeTypeRecord
    | NodeTypeUnknown
    | NodeTypePrimitive;

  export interface WipProfileReplace {
    kind: "replace";
    type: NodeType[];
  }

  export interface WipProfileAdd {
    kind: "add";
    type: NodeType[];
  }

  export type WipProfile = WipProfileReplace | WipProfileAdd;

  export interface NodeTypeBase {
    name?: string;
    wip?: true | WipProfile;
  }

  export interface NodeTypeObject extends NodeTypeBase {
    kind: "object";
    discriminator?: string;
    properties: Record<string, NodeField> | NodeTypeObject[];
  }

  export interface NodeField {
    kind: "field";
    optional: boolean;
    discriminator?: true;
    type: NodeType[];
  }

  export interface NodeTypeArray extends NodeTypeBase {
    kind: "array";
    type: NodeType[];
  }

  export interface NodeTypeRecord extends NodeTypeBase {
    kind: "record";
    type?: NodeType[];
  }

  export interface NodeTypeUnknown extends NodeTypeBase {
    kind: "unknown";
  }

  export type NodeTypePrimitive =
    | NodeTypeString
    | NodeTypeNumber
    | NodeTypeBoolean
    | NodeTypeNull
    | NodeTypeUndefined;

  export interface NodeTypeString extends NodeTypeBase {
    kind: "string";
    values?: string[];
    literal?: boolean;
  }

  export interface NodeTypeNumber extends NodeTypeBase {
    kind: "number";
    values?: number[];
    literal?: boolean;
  }

  export interface NodeTypeBoolean extends NodeTypeBase {
    kind: "boolean";
    values?: boolean[];
    literal?: boolean;
  }

  export interface NodeTypeNull extends NodeTypeBase {
    kind: "null";
  }

  export interface NodeTypeUndefined extends NodeTypeBase {
    kind: "undefined";
  }
}

const scanQueues: Record<string, Promise<void>> = {};
const LOCK_RETRY_MS = 20;

export namespace scanTypes {
  export interface Props {
    id: string;
    url: string;
    value: unknown;
  }
}

export function scanTypes(props: scanTypes.Props): void {
  const { id, url, value } = props;
  const scanFilePath = getScanFilePath(url, id);
  if (!process.env.ALUMNIUM_DEV_DATA_TYPES_SCAN) return;

  enqueueScan(scanFilePath, async () => {
    await withScanFileLock(scanFilePath, async () => {
      const root = await readScanFile(scanFilePath);
      mergeUnionWithValue(root, value);
      await writeScanFile(scanFilePath, root);
    });
  });
}

function enqueueScan(scanFilePath: string, task: () => Promise<void>): void {
  const previous = scanQueues[scanFilePath] ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  scanQueues[scanFilePath] = current;

  void current
    .catch((error: unknown) => {
      console.error(
        `Failed to scan types for '${scanFilePath}': ${errorMessage(error)}`,
      );
      process.exit(1);
    })
    .finally(() => {
      if (scanQueues[scanFilePath] === current) delete scanQueues[scanFilePath];
    });
}

function getScanFilePath(moduleUrl: string, structureId: string): string {
  const sourcePath = fileURLToPath(moduleUrl);
  const sourceInfo = path.parse(sourcePath);
  const filename = `${sourceInfo.name}.${structureId}.types-scan.json`;
  return path.join(sourceInfo.dir, filename);
}

async function readScanFile(
  scanFilePath: string,
): Promise<TypesScan.NodeType[]> {
  const raw = await fs.readFile(scanFilePath, "utf-8").catch(() => null);
  if (raw === null) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TypesScan.NodeType[];
  } catch {
    return [];
  }
}

async function writeScanFile(
  scanFilePath: string,
  root: TypesScan.NodeType[],
): Promise<void> {
  const rawJson = `${JSON.stringify(root, null, 2)}\n`;
  const formatted = await format(path.basename(scanFilePath), rawJson, {
    printWidth: 80,
  });
  if (formatted.errors.length) {
    const details = formatted.errors.map((error) => error.message).join("; ");
    console.error(`Failed to format '${scanFilePath}': ${details}`);
    process.exit(1);
  }

  await fs.writeFile(scanFilePath, formatted.code);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function withScanFileLock(
  scanFilePath: string,
  task: () => Promise<void>,
): Promise<void> {
  const lockPath = `${scanFilePath}.lock`;

  while (true) {
    const handle = await fs.open(lockPath, "wx").catch(() => null);
    if (handle) {
      try {
        await task();
      } finally {
        await handle.close().catch(() => undefined);
        await fs.unlink(lockPath).catch(() => undefined);
      }
      return;
    }

    await sleep(LOCK_RETRY_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeUnionWithValue(
  target: TypesScan.NodeType[],
  value: unknown,
): void {
  if (!Array.isArray(target)) return;
  if (target.some((item) => item.kind === "unknown")) return;

  if (value === undefined) {
    getOrCreateUndefined(target);
    return;
  }

  if (value === null) {
    getOrCreateNull(target);
    return;
  }

  if (typeof value === "string") {
    mergeStringValue(target, value);
    return;
  }

  if (typeof value === "number") {
    mergeNumberValue(target, value);
    return;
  }

  if (typeof value === "boolean") {
    mergeBooleanValue(target, value);
    return;
  }

  if (Array.isArray(value)) {
    const arrayNode = getOrCreateArray(target);
    for (const item of value) mergeUnionWithValue(arrayNode.type, item);
    return;
  }

  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;

  const recordNode = getRecordNode(target);
  if (recordNode) {
    if (!Array.isArray(recordNode.type)) return;
    for (const item of Object.values(record)) {
      mergeUnionWithValue(recordNode.type, item);
    }
    return;
  }

  const existingObject = target.find((item) => item.kind === "object");
  if (existingObject?.kind === "object") {
    mergeObjectValue(existingObject, record, true);
    return;
  }

  const objectNode = createAndPushObjectNode(target);
  mergeObjectValue(objectNode, record, false);
}

function mergeObjectValue(
  node: TypesScan.NodeTypeObject,
  value: Record<string, unknown>,
  objectAlreadyPresent: boolean,
): void {
  if (node.discriminator) {
    mergeDiscriminatedObjectValue(node, value);
    return;
  }

  if (Array.isArray(node.properties)) node.properties = {};

  const incomingKeys = new Set(Object.keys(value));
  const knownKeys = Object.keys(node.properties);

  for (const key of knownKeys) {
    const field = ensureFieldNode(node.properties, key, objectAlreadyPresent);
    if (!(key in value)) field.optional = true;
  }

  for (const key of incomingKeys) {
    const field = ensureFieldNode(node.properties, key, objectAlreadyPresent);
    mergeUnionWithValue(field.type, value[key]);
  }
}

function mergeDiscriminatedObjectValue(
  node: TypesScan.NodeTypeObject,
  value: Record<string, unknown>,
): void {
  const discriminatorField = node.discriminator;
  if (!discriminatorField) return;

  if (!Array.isArray(node.properties)) node.properties = [];
  const variants = node.properties;
  const discriminatorValue = value[discriminatorField];

  const existingVariant = variants.find((variant) =>
    hasDiscriminatorVariantValue(
      variant,
      discriminatorField,
      discriminatorValue,
    ),
  );

  const variantAlreadyPresent = Boolean(existingVariant);
  const variant = existingVariant ?? createDiscriminatedVariant(variants);
  mergeDiscriminatedVariant(
    variant,
    value,
    discriminatorField,
    discriminatorValue,
    variantAlreadyPresent,
  );
}

function hasDiscriminatorVariantValue(
  variant: TypesScan.NodeTypeObject,
  fieldName: string,
  value: unknown,
): boolean {
  if (Array.isArray(variant.properties)) variant.properties = {};
  const properties = variant.properties;

  const field = properties[fieldName];
  if (!field) return false;
  if (field.discriminator !== true) return false;
  if (!Array.isArray(field.type)) return false;

  for (const typeNode of field.type) {
    if (!isPrimitiveValueNode(typeNode)) continue;
    if (isMatchingDiscriminatorPrimitive(typeNode, value)) return true;
  }

  return false;
}

function createDiscriminatedVariant(
  variants: TypesScan.NodeTypeObject[],
): TypesScan.NodeTypeObject {
  const variant: TypesScan.NodeTypeObject = {
    kind: "object",
    properties: {},
  };
  variants.push(variant);
  return variant;
}

function mergeDiscriminatedVariant(
  variant: TypesScan.NodeTypeObject,
  value: Record<string, unknown>,
  discriminatorField: string,
  discriminatorValue: unknown,
  variantAlreadyPresent: boolean,
): void {
  if (Array.isArray(variant.properties)) variant.properties = {};
  const properties = variant.properties;

  const incomingKeys = new Set(Object.keys(value));
  const knownKeys = Object.keys(properties);

  for (const key of knownKeys) {
    if (key === discriminatorField) continue;
    const field = ensureFieldNode(properties, key, variantAlreadyPresent);
    if (!(key in value)) field.optional = true;
  }

  for (const key of incomingKeys) {
    const field = ensureFieldNode(properties, key, variantAlreadyPresent);
    if (key === discriminatorField) {
      mergeDiscriminatorFieldType(field, discriminatorValue);
      continue;
    }

    mergeUnionWithValue(field.type, value[key]);
  }

  if (!(discriminatorField in properties)) {
    const field = ensureFieldNode(properties, discriminatorField, false);
    mergeDiscriminatorFieldType(field, discriminatorValue);
  }
}

function mergeDiscriminatorFieldType(
  field: TypesScan.NodeField,
  value: unknown,
): void {
  field.discriminator = true;
  field.optional = false;
  if (!Array.isArray(field.type)) field.type = [];

  const discriminatorNode = createDiscriminatorPrimitiveNode(value);
  if (!discriminatorNode) return;

  const existing = field.type.find(
    (item) =>
      isPrimitiveValueNode(item) &&
      isSameDiscriminatorPrimitive(item, discriminatorNode),
  );
  if (existing) return;

  field.type.push(discriminatorNode);
}

function createDiscriminatorPrimitiveNode(
  value: unknown,
): TypesScan.NodeTypePrimitive | null {
  if (value === undefined) {
    return { kind: "undefined" };
  }

  if (value === null) {
    return { kind: "null" };
  }

  if (typeof value === "string") {
    return { kind: "string", values: [value] };
  }

  if (typeof value === "number") {
    return { kind: "number", values: [value] };
  }

  if (typeof value === "boolean") {
    return { kind: "boolean", values: [value] };
  }

  return null;
}

function isPrimitiveValueNode(
  node: TypesScan.NodeType,
): node is TypesScan.NodeTypePrimitive {
  if (
    node.kind !== "string" &&
    node.kind !== "number" &&
    node.kind !== "boolean" &&
    node.kind !== "null" &&
    node.kind !== "undefined"
  ) {
    return false;
  }

  return true;
}

function mergePrimitiveValue<T extends string | number | boolean>(
  node: { values?: T[]; literal?: boolean },
  value: T,
): void {
  if (node.literal === false) return;

  if (!node.values) {
    node.values = [value];
    return;
  }

  if (!node.values.includes(value)) node.values.push(value);
}

function createAndPushObjectNode(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeObject {
  const node: TypesScan.NodeTypeObject = { kind: "object", properties: {} };
  target.push(node);
  return node;
}

function getOrCreateArray(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeArray {
  const existing = target.find((item) => item.kind === "array");
  if (existing?.kind === "array") {
    if (!Array.isArray(existing.type)) existing.type = [];
    return existing;
  }
  const node: TypesScan.NodeTypeArray = { kind: "array", type: [] };
  target.push(node);
  return node;
}

function mergeStringValue(target: TypesScan.NodeType[], value: string): void {
  const node = getOrCreateStringValueNode(target);
  if (!node) return;
  mergePrimitiveValue(node, value);
}

function ensureFieldNode(
  properties: Record<string, TypesScan.NodeField>,
  key: string,
  optional: boolean,
): TypesScan.NodeField {
  const existing = properties[key];
  if (existing?.kind === "field") {
    if (!Array.isArray(existing.type)) existing.type = [];
    return existing;
  }

  const field: TypesScan.NodeField = { kind: "field", optional, type: [] };
  properties[key] = field;
  return field;
}

function mergeNumberValue(target: TypesScan.NodeType[], value: number): void {
  const node = getOrCreateNumberValueNode(target);
  if (!node) return;
  mergePrimitiveValue(node, value);
}

function mergeBooleanValue(target: TypesScan.NodeType[], value: boolean): void {
  const node = getOrCreateBooleanValueNode(target);
  if (!node) return;
  mergePrimitiveValue(node, value);
}

function getOrCreateNull(target: TypesScan.NodeType[]): TypesScan.NodeTypeNull {
  const existing = target.find((item) => item.kind === "null");
  if (existing?.kind === "null") return existing;
  const node: TypesScan.NodeTypeNull = { kind: "null" };
  target.push(node);
  return node;
}

function getOrCreateUndefined(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeUndefined {
  const existing = target.find((item) => item.kind === "undefined");
  if (existing?.kind === "undefined") return existing;
  const node: TypesScan.NodeTypeUndefined = { kind: "undefined" };
  target.push(node);
  return node;
}

function getRecordNode(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeRecord | undefined {
  const node = target.find((item) => item.kind === "record");
  if (node?.kind === "record") return node;
  return undefined;
}

export function normalizeForHash(value: unknown): unknown {
  const cloned = structuredClone(value);
  removeNamesDeep(cloned);
  return cloned;
}

export function hashValue(value: unknown): string {
  return xxh64Str(canonize(normalizeForHash(value)));
}

export function isHashEqual(left: unknown, right: unknown): boolean {
  return hashValue(left) === hashValue(right);
}

function removeNamesDeep(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) removeNamesDeep(item);
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  delete record.name;
  for (const item of Object.values(record)) removeNamesDeep(item);
}

function getOrCreateStringValueNode(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeString | null {
  const nodes = target.filter((item) => item.kind === "string");
  if (nodes.some((item) => item.literal === false)) return null;

  const existing = nodes[0];
  if (existing?.kind === "string") return existing;

  const node: TypesScan.NodeTypeString = { kind: "string", values: [] };
  target.push(node);
  return node;
}

function getOrCreateNumberValueNode(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeNumber | null {
  const nodes = target.filter((item) => item.kind === "number");
  if (nodes.some((item) => item.literal === false)) return null;

  const existing = nodes[0];
  if (existing?.kind === "number") return existing;

  const node: TypesScan.NodeTypeNumber = { kind: "number", values: [] };
  target.push(node);
  return node;
}

function getOrCreateBooleanValueNode(
  target: TypesScan.NodeType[],
): TypesScan.NodeTypeBoolean | null {
  const nodes = target.filter((item) => item.kind === "boolean");
  if (nodes.some((item) => item.literal === false)) return null;

  const existing = nodes[0];
  if (existing?.kind === "boolean") return existing;

  const node: TypesScan.NodeTypeBoolean = { kind: "boolean", values: [] };
  target.push(node);
  return node;
}

function isMatchingDiscriminatorPrimitive(
  node: TypesScan.NodeTypePrimitive,
  value: unknown,
): boolean {
  if (!isValuedPrimitive(node)) {
    if (node.kind === "undefined") return value === undefined;
    return value === null;
  }

  if (!Array.isArray(node.values) || node.values.length !== 1) return false;
  return Object.is(node.values[0], value);
}

function isSameDiscriminatorPrimitive(
  left: TypesScan.NodeTypePrimitive,
  right: TypesScan.NodeTypePrimitive,
): boolean {
  if (left.kind !== right.kind) return false;

  if (!isValuedPrimitive(left) || !isValuedPrimitive(right)) return true;

  if (!Array.isArray(left.values) || left.values.length !== 1) return false;
  if (!Array.isArray(right.values) || right.values.length !== 1) return false;
  return Object.is(left.values[0], right.values[0]);
}

function isValuedPrimitive(
  node: TypesScan.NodeTypePrimitive,
): node is
  | TypesScan.NodeTypeString
  | TypesScan.NodeTypeNumber
  | TypesScan.NodeTypeBoolean {
  return (
    node.kind === "string" || node.kind === "number" || node.kind === "boolean"
  );
}
