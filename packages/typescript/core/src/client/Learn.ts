import type { Client } from "../clients/Client.ts";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";

const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace Learn {
  /**
   * Teaches Alumnium how to handle instructions. Lessons are persisted for
   * the current app and apply to later sessions.
   *
   * Calling it directly is the same as calling `learn.do()`.
   */
  export interface Callable {
    (goal: string, actions: string[]): Promise<void>;
    do: Learn["do"];
    get: Learn["get"];
    check: Learn["check"];
    find: Learn["find"];
    area: Learn["area"];
  }
}

export class Learn {
  #client: Client;
  #driver: BaseDriver;

  static callable(client: Client, driver: BaseDriver): Learn.Callable {
    const learn = new Learn(client, driver);
    return Object.assign(
      (goal: string, actions: string[]) => learn.do(goal, actions),
      {
        do: learn.do.bind(learn),
        get: learn.get.bind(learn),
        check: learn.check.bind(learn),
        find: learn.find.bind(learn),
        area: learn.area.bind(learn),
      },
    );
  }

  constructor(client: Client, driver: BaseDriver) {
    this.#client = client;
    this.#driver = driver;
  }

  /**
   * Teaches the actions to perform to achieve the goal with `do()`.
   *
   * @param goal Goal in the same format as in `do()`.
   * @param actions Actions to achieve the goal.
   */
  @span("alumni.learn", spanAttrs("do"))
  async do(goal: string, actions: string[]): Promise<void> {
    return this.#client.addExample({
      goal,
      actions,
      app: await this.#driver.app(),
    });
  }

  /**
   * Teaches how to retrieve the data with `get()`.
   *
   * @param data Data in the same format as in `get()`.
   * @param hint How to retrieve it, e.g. which element holds it.
   */
  @span("alumni.learn", spanAttrs("get"))
  get(data: string, hint: string): Promise<void> {
    return this.#addHint("get", data, hint);
  }

  /**
   * Teaches how to verify the statement with `check()`.
   *
   * @param statement Statement in the same format as in `check()`.
   * @param hint How to verify it, e.g. what makes it true.
   */
  @span("alumni.learn", spanAttrs("check"))
  check(statement: string, hint: string): Promise<void> {
    return this.#addHint("check", statement, hint);
  }

  /**
   * Teaches how to locate the element with `find()`.
   *
   * @param description Description in the same format as in `find()`.
   * @param hint How to locate it, e.g. its role and name.
   */
  @span("alumni.learn", spanAttrs("find"))
  find(description: string, hint: string): Promise<void> {
    return this.#addHint("find", description, hint);
  }

  /**
   * Teaches how to identify the area with `area()`.
   *
   * @param description Description in the same format as in `area()`.
   * @param hint How to identify it, e.g. its container and heading.
   */
  @span("alumni.learn", spanAttrs("area"))
  area(description: string, hint: string): Promise<void> {
    return this.#addHint("area", description, hint);
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
    });
  }
}

function spanAttrs(
  kind: Tracer.SpansAlumni["alumni.learn"]["Attrs"]["alumni.learn.kind"],
) {
  return (): Tracer.SpansAlumni["alumni.learn"]["Attrs"] => ({
    "alumni.flavor": "alumni",
    "alumni.learn.kind": kind,
  });
}
