import path from "node:path";
import filenamify from "filenamify";
import z from "zod";

export const jsonString = <Type extends z.core.$ZodType>(schema: Type) =>
  z.codec(z.string(), schema, {
    decode: (str, ctx) => {
      try {
        return JSON.parse(str);
      } catch (err) {
        ctx.issues.push({
          code: "invalid_format",
          format: "json",
          input: str,
          message: String(err),
        });
        return z.NEVER;
      }
    },
    encode: (value) => JSON.stringify(value),
  });

export const arrayString = <Schema extends z.ZodEnum<any> | z.ZodString>(
  schema: Schema = z.string() as Schema,
) =>
  z.codec(z.string(), z.array(schema), {
    decode: (str) =>
      str
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => schema.parse(s)),
    encode: (value) => value.join(","),
  });

export const sizeString = () =>
  z.codec(z.string(), z.number().nonnegative(), {
    decode: (value, ctx) => {
      const match = SIZE_RE.exec(value.trim());
      const multiplier = match && SIZE_UNITS[(match[2] ?? "B").toUpperCase()];
      if (!match || !multiplier) {
        ctx.issues.push({
          code: "invalid_format",
          format: "size",
          input: value,
          message: "Expected a size like 500MB or 1GB",
        });
        return z.NEVER;
      }
      return Math.round(parseFloat(match[1] ?? "") * multiplier);
    },
    encode: (value) => encodeWithUnit(value, SIZE_UNITS),
  });

export const durationString = () =>
  z.codec(z.string(), z.number().nonnegative(), {
    decode: (value, ctx) => {
      const match = DURATION_RE.exec(value.trim());
      const multiplier =
        match && DURATION_UNITS[(match[2] ?? "").toLowerCase()];
      if (!match || !multiplier) {
        ctx.issues.push({
          code: "invalid_format",
          format: "duration",
          input: value,
          message: "Expected a duration like 12h or 30d",
        });
        return z.NEVER;
      }
      return Math.round(parseFloat(match[1] ?? "") * multiplier);
    },
    encode: (value) => encodeWithUnit(value, DURATION_UNITS),
  });

const SIZE_RE = /^(\d+(?:\.\d+)?)\s*([KMGT]?B)?$/i;

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i;

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

function encodeWithUnit(value: number, units: Record<string, number>): string {
  const [unit, multiplier] = Object.entries(units)
    .filter(([, multiplier]) => value >= multiplier && value % multiplier === 0)
    .at(-1) ??
    Object.entries(units)[0] ?? ["", 1];
  return `${value / multiplier}${unit}`;
}

const ANY_SEP_RE = /[/\\]+/g;

export const pathString = () =>
  z.codec(z.string().min(1), z.string(), {
    decode: (value) => path.normalize(value.replace(ANY_SEP_RE, path.sep)),
    encode: (value) => value,
  });

export const filenameString = () =>
  z.string().min(1).refine(isFilename, { message: "Invalid filename" });

function isFilename(value: string): boolean {
  return (
    !ANY_SEP_RE.test(value) && filenamify(value, { replacement: "_" }) === value
  );
}
