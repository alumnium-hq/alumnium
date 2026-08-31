import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { AppId } from "../AppId.ts";
import { Env } from "../Env.ts";
import { NavigationPolicy } from "../NavigationPolicy.ts";
import { Logger } from "../telemetry/Logger.ts";
import type { ToolClass } from "../tools/BaseTool.ts";
import { TreeDevDrill } from "../tree/dev/TreeDevDrill.ts";
import { TreeDevDrillStore } from "../tree/dev/TreeDevDrillStore.ts";
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import type { Driver } from "./Driver.ts";
import type { Element } from "./index.ts";
import type { Keys } from "./keys.ts";

const logger = Logger.get(import.meta.url);

export abstract class BaseDriver {
  abstract platform: Driver.Platform;
  abstract supportedTools: Set<ToolClass>;
  protected abstract fetchAccessibilityTree(): Promise<BaseAccessibilityTree>;

  /**
   * Domain allowlist/denylist enforced against navigation targets. Every driver gets one by
   * default (see {@link NavigationPolicy.create}) so baseline SSRF protection applies
   * unconditionally, even to a driver constructed directly rather than via `Alumni`.
   */
  navigationPolicy: NavigationPolicy = NavigationPolicy.create({});

  #cachedAccessibilityTree: BaseAccessibilityTree | null = null;

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    this.#cachedAccessibilityTree ??= await this.fetchAccessibilityTree();
    return this.#cachedAccessibilityTree;
  }

  setAccessibilityTree(tree: BaseAccessibilityTree) {
    this.#cachedAccessibilityTree = tree;
  }

  resetAccessibilityTree() {
    this.#cachedAccessibilityTree = null;
  }

  abstract click(id: number): Promise<void>;
  abstract dragSlider(id: number, value: number): void | Promise<void>;
  abstract dragAndDrop(fromId: number, toId: number): Promise<void>;
  abstract pressKey(key: Keys.Key): Promise<void>;
  abstract quit(): Promise<void>;
  abstract back(): Promise<void>;
  abstract screenshot(): Promise<string>;
  abstract title(): Promise<string>;
  abstract type(id: number, text: string): Promise<void>;
  abstract url(): Promise<string>;
  abstract app(): Promise<AppId>;
  abstract findElement(id: number): Promise<Element>;
  abstract visit(url: string): Promise<void>;
  abstract scrollTo(id: number): Promise<void>;
  abstract executeScript(script: string): Promise<void>;
  abstract switchToNextTab(): Promise<void>;
  abstract switchToPreviousTab(): Promise<void>;
  abstract wait(seconds: number): Promise<void>;
  abstract waitForSelector(selector: string, timeout?: number): Promise<void>;
  abstract printToPdf(filepath: string): Promise<void>;

  //#region Stateful

  static stateful<This extends BaseDriver, Args extends unknown[], Result>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<
      (this: This, ...args: Args) => Promise<Result>
    >,
  ): TypedPropertyDescriptor<(this: This, ...args: Args) => Promise<Result>>;

  static stateful(action: string): BaseDriver.StatefulDecorator;

  static stateful(
    targetOrAction: object | string,
    propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>,
  ) {
    if (typeof targetOrAction === "string") {
      return function (
        target: object,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>,
      ) {
        return BaseDriver.#decorateStateful(
          targetOrAction,
          target,
          propertyKey,
          descriptor,
        );
      };
    }

    if (propertyKey === undefined || descriptor === undefined) {
      throw new Error("@stateful can only decorate methods");
    }
    return BaseDriver.#decorateStateful(
      String(propertyKey),
      targetOrAction,
      propertyKey,
      descriptor,
    );
  }

  static #decorateStateful<
    This extends BaseDriver,
    Args extends unknown[],
    Result,
  >(
    action: string,
    _target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<
      (this: This, ...args: Args) => Promise<Result>
    >,
  ): TypedPropertyDescriptor<(this: This, ...args: Args) => Promise<Result>> {
    const method = descriptor.value;
    if (!method) throw new Error("@stateful can only decorate methods");

    const statefulMethod = async function (this: This, ...args: Args) {
      const result = await method.call(this, ...args);
      await this.#devDrillTreeAfterStateChange(action);
      return result;
    };
    Object.defineProperty(statefulMethod, "name", {
      value:
        typeof propertyKey === "symbol" ? propertyKey.toString() : propertyKey,
    });
    descriptor.value = statefulMethod;
    return descriptor;
  }

  //#endregion

  //#region Dev

  #devDrillStore = TreeDevDrillStore.default;

  protected devDrillProbeTree(
    _tree: BaseAccessibilityTree,
    _rawId: number,
  ): Promise<TreeDevDrill.ExternalId> {
    return Promise.reject(
      new TreeDevDrillError(
        "resolve",
        new Error(`Tree development drill is unsupported for ${this.platform}`),
      ),
    );
  }

  async #devDrillTreeAfterStateChange(action: string): Promise<void> {
    if (!Env.ALUMNIUM_DEV_DRILL_TEST_TREES) return;

    const previousTree = this.#cachedAccessibilityTree;
    try {
      this.resetAccessibilityTree();
      const freshTree = await this.getAccessibilityTree();
      const drill = await TreeDevDrill.run({
        action,
        platform: this.platform,
        tree: freshTree,
        probe: (tree, rawId) => this.devDrillProbeTree(tree, rawId),
      });
      if (drill.result.failures.length) {
        await this.#devDrillStore.update(drill.key, drill.result);
      }
      logger.info(
        `Drilled accessibility tree: ${drill.tested} IDs, ${drill.result.failures.length} failures`,
        { action, path: this.#devDrillStore.resultPath },
      );
    } catch (error) {
      logger.error(
        `Failed to drill accessibility tree: ${TreeDevDrill.errorMessage(error)}`,
        { action, path: this.#devDrillStore.resultPath },
      );
    } finally {
      this.#cachedAccessibilityTree = previousTree;
    }
  }

  //#endregion
}

export namespace BaseDriver {
  export interface StatefulDecorator {
    <This extends BaseDriver, Args extends unknown[], Result>(
      target: object,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<
        (this: This, ...args: Args) => Promise<Result>
      >,
    ): TypedPropertyDescriptor<(this: This, ...args: Args) => Promise<Result>>;
  }
}
