import { describe, expect, it } from "vitest";
import { KnowledgeRelevance } from "./KnowledgeRelevance.ts";

describe(KnowledgeRelevance, () => {
  const select = (lessons: string[], instruction: string, topK = 8) =>
    KnowledgeRelevance.select(
      new Map(lessons.map((lesson) => [lesson, lesson])),
      instruction,
      topK,
    ).map(({ instruction: lesson }) => lesson);

  it("selects exact matches regardless of case and spacing", () => {
    expect(select(["Log in", "sign up"], "  log   IN ", 0)).toEqual(["Log in"]);
  });

  it("matches placeholders regardless of their names", () => {
    expect(
      select(["send the message : {message}"], "Send the message : {text}", 0),
    ).toEqual(["send the message : {message}"]);
  });

  it("matches check statements without their prefix", () => {
    expect(
      select(
        ["cart is empty"],
        "Is the following true or false - cart is empty",
        0,
      ),
    ).toEqual(["cart is empty"]);
  });

  it("selects similar lessons by word overlap, most similar first", () => {
    expect(
      select(
        [
          "quantity of iPhone 12 Pro Max",
          "price of iPhone 12 Pro Max",
          "titles of products",
        ],
        "quantity of iPhone 12 Mini",
      ),
    ).toEqual(["quantity of iPhone 12 Pro Max", "price of iPhone 12 Pro Max"]);
  });

  it("leaves out lessons with no shared words", () => {
    expect(select(["log in", "close the banner"], "sign up")).toEqual([]);
  });

  it("caps similar lessons at top k and always keeps exact matches", () => {
    const lessons = [
      "add laptop to cart",
      "add phone to cart",
      "add tv to cart",
    ];

    expect(select(lessons, "add laptop to cart", 1)).toEqual([
      "add laptop to cart",
      "add phone to cart",
    ]);
  });

  it("breaks ties by instruction", () => {
    expect(
      select(
        ["remove b from cart", "remove a from cart"],
        "remove c from cart",
      ),
    ).toEqual(["remove a from cart", "remove b from cart"]);
  });

  it("scores exact matches 1", () => {
    const [match] = KnowledgeRelevance.select(
      new Map([["log in", 1]]),
      "log in",
      0,
    );

    expect(match).toEqual({
      instruction: "log in",
      value: 1,
      score: 1,
      exact: true,
    });
  });
});
