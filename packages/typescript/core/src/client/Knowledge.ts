import type { Client } from "../clients/Client.ts";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace Knowledge {
  /** Platform whose layer a lesson persists in. */
  export type Platform = "web" | "ios" | "android";

  /** Teaches Alumnium how to handle instructions in one knowledge layer. */
  export interface Layered {
    do: Knowledge["do"];
    get: Knowledge["get"];
    check: Knowledge["check"];
    find: Knowledge["find"];
    area: Knowledge["area"];
    forget: Knowledge["forget"];
    clear: Knowledge["clear"];
  }

  /**
   * Teaches Alumnium how to handle instructions. Lessons go to the product
   * layer of the knowledge scope; `on()` and `shared()` pick another layer.
   */
  export interface Scoped extends Layered {
    /** Teaches lessons for one platform of the product. */
    on(platform: Platform): Layered;
    /** Teaches lessons shared by all products. */
    shared(): Layered;
  }

  /**
   * Deprecated `Alumni.learn`: the same as `Alumni.knowledge`, and calling it
   * directly is the same as calling `knowledge.do()`.
   *
   * @deprecated Use `Alumni.knowledge` instead.
   */
  export interface Callable extends Scoped {
    /** @deprecated Use `Alumni.knowledge.do()` instead. */
    (goal: string, actions: string[]): Promise<void>;
  }
}

let warnedDeprecatedLearn = false;

export class Knowledge {
  #client: Client;
  #driver: BaseDriver;
  #layer: Client.LessonLayer;

  static scoped(client: Client, driver: BaseDriver): Knowledge.Scoped {
    const layered = (layer: Client.LessonLayer) =>
      new Knowledge(client, driver, layer).#layered();
    return {
      ...layered("product"),
      on: (platform: Knowledge.Platform) => layered(platform),
      shared: () => layered("shared"),
    };
  }

  /**
   * Wraps the knowledge as the deprecated `Alumni.learn`, which warns once
   * when used.
   */
  static deprecatedCallable(knowledge: Knowledge.Scoped): Knowledge.Callable {
    const warned =
      <Args extends unknown[], Result>(fn: (...args: Args) => Result) =>
      (...args: Args): Result => {
        if (!warnedDeprecatedLearn) {
          warnedDeprecatedLearn = true;
          logger.warn(
            "`Alumni.learn` is deprecated and will be removed in a future release, use `Alumni.knowledge` instead, e.g. `al.knowledge.do(goal, actions)`.",
          );
        }
        return fn(...args);
      };

    return Object.assign(
      warned((goal: string, actions: string[]) => knowledge.do(goal, actions)),
      {
        do: warned(knowledge.do),
        get: warned(knowledge.get),
        check: warned(knowledge.check),
        find: warned(knowledge.find),
        area: warned(knowledge.area),
        forget: warned(knowledge.forget),
        clear: warned(knowledge.clear),
        on: warned((platform: Knowledge.Platform) => knowledge.on(platform)),
        shared: warned(() => knowledge.shared()),
      },
    );
  }

  constructor(
    client: Client,
    driver: BaseDriver,
    layer: Client.LessonLayer = "product",
  ) {
    this.#client = client;
    this.#driver = driver;
    this.#layer = layer;
  }

  /**
   * Teaches the actions to perform to achieve the goal with `do()`.
   *
   * @param goal Goal in the same format as in `do()`.
   * @param actions Actions to achieve the goal.
   */
  @span("alumni.knowledge.learn", spanAttrs("do"))
  async do(goal: string, actions: string[]): Promise<void> {
    return this.#client.addExample({
      goal,
      actions,
      app: await this.#driver.app(),
      layer: this.#layer,
    });
  }

  /**
   * Teaches how to retrieve the data with `get()`.
   *
   * @param data Data in the same format as in `get()`.
   * @param hint How to retrieve it, e.g. which element holds it.
   */
  @span("alumni.knowledge.learn", spanAttrs("get"))
  get(data: string, hint: string): Promise<void> {
    return this.#addHint("get", data, hint);
  }

  /**
   * Teaches how to verify the statement with `check()`.
   *
   * @param statement Statement in the same format as in `check()`.
   * @param hint How to verify it, e.g. what makes it true.
   */
  @span("alumni.knowledge.learn", spanAttrs("check"))
  check(statement: string, hint: string): Promise<void> {
    return this.#addHint("check", statement, hint);
  }

  /**
   * Teaches how to locate the element with `find()`.
   *
   * @param description Description in the same format as in `find()`.
   * @param hint How to locate it, e.g. its role and name.
   */
  @span("alumni.knowledge.learn", spanAttrs("find"))
  find(description: string, hint: string): Promise<void> {
    return this.#addHint("find", description, hint);
  }

  /**
   * Teaches how to identify the area with `area()`.
   *
   * @param description Description in the same format as in `area()`.
   * @param hint How to identify it, e.g. its container and heading.
   */
  @span("alumni.knowledge.learn", spanAttrs("area"))
  area(description: string, hint: string): Promise<void> {
    return this.#addHint("area", description, hint);
  }

  /**
   * Forgets the lesson for the instruction in this layer, learned in this or
   * an earlier session.
   *
   * @returns Whether a lesson was forgotten.
   */
  @span("alumni.knowledge.forget", baseSpanAttrs)
  forget(kind: Client.LessonKind, instruction: string): Promise<boolean> {
    return this.#client.forgetLesson({ kind, instruction, layer: this.#layer });
  }

  /** Forgets every lesson in this layer of the knowledge scope. */
  @span("alumni.knowledge.clear", baseSpanAttrs)
  clear(): Promise<void> {
    return this.#client.clearLayer({ layer: this.#layer });
  }

  #layered(): Knowledge.Layered {
    return {
      do: this.do.bind(this),
      get: this.get.bind(this),
      check: this.check.bind(this),
      find: this.find.bind(this),
      area: this.area.bind(this),
      forget: this.forget.bind(this),
      clear: this.clear.bind(this),
    };
  }

  async #addHint(
    kind: Client.HintKind,
    instruction: string,
    hint: string,
  ): Promise<void> {
    return this.#client.addHint({
      kind,
      instruction,
      hint,
      app: await this.#driver.app(),
      layer: this.#layer,
    });
  }
}

function spanAttrs(
  kind: Tracer.SpansAlumni["alumni.knowledge.learn"]["Attrs"]["alumni.knowledge.kind"],
) {
  return (): Tracer.SpansAlumni["alumni.knowledge.learn"]["Attrs"] => ({
    "alumni.flavor": "alumni",
    "alumni.knowledge.kind": kind,
  });
}

function baseSpanAttrs(): Tracer.SpansAlumniAttrsBase {
  return { "alumni.flavor": "alumni" };
}
