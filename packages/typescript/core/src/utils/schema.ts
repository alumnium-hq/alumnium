import filenamify from "filenamify";
import path from "node:path";
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
