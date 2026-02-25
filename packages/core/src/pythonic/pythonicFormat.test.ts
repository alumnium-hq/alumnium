import { describe, expect, it } from "bun:test";
import { pythonicFormat } from "./pythonicFormat.js";

describe(pythonicFormat, () => {
  it("replaces one variable", () => {
    expect(pythonicFormat("Hello, {name}!", { name: "Alice" })).toBe(
      "Hello, Alice!",
    );
  });

  it("replaces multiple variables", () => {
    expect(
      pythonicFormat("Hello, {name}! {question}", {
        name: "Alice",
        question: "How are you?",
      }),
    ).toBe("Hello, Alice! How are you?");
  });

  it("replaces repeated and hyphenated variables", () => {
    expect(pythonicFormat("{var} + {var}", { var: "x" })).toBe("x + x");
  });

  it("leaves unknown placeholders as-is", () => {
    expect(pythonicFormat("Hello, {name}! {question}", { name: "Alice" })).toBe(
      "Hello, Alice! {question}",
    );
  });
});
