import * as fs from "fs/promises";
import { WebElement } from "selenium-webdriver";
import {
  AriaAccessibilityTree,
  BaseAccessibilityTree,
  BaseDriver,
  sleep,
  Telemetry,
  TreeDevDrillError,
  waiterScriptSource,
} from "@alumnium/core/internal";
import {
  acquiescenceScriptSource,
  ariaSnapshotScriptSource,
} from "./scripts/bundledScripts.ts";
import { SeleniumDriver } from "./SeleniumDriver.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

const SANDBOX = "alumnium";

const ACQUIESCENCE_FUNCTION = `() => {
${acquiescenceScriptSource}
globalThis.Acquiescence = Acquiescence;
}`;

const SNAPSHOT_FUNCTION = ariaSnapshotScriptSource;

const NAVIGATION_START_TIMEOUT_MS = 250;
const NAVIGATION_LOAD_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_INTERVAL_MS = 50;

const NAVIGATION_EVENTS = [
  "browsingContext.contextCreated",
  "browsingContext.contextDestroyed",
  "browsingContext.navigationStarted",
  "browsingContext.load",
  "browsingContext.navigationAborted",
  "browsingContext.navigationFailed",
];

interface BiDiContextEvent {
  context: string;
}

interface BiDiRemoteValue {
  type: string;
  value?: unknown;
  sharedId?: string;
}

interface BiDiCallFunctionResponse {
  type: "success" | "exception";
  result?: BiDiRemoteValue;
  exceptionDetails?: { text?: string };
}

interface BiDiDataResponse {
  data: string;
}

/**
 * Selenium driver for Firefox (WebDriver BiDi). Builds accessibility trees with acquiescence
 * over WebDriver BiDi instead of CDP, and locates elements by BiDi shared IDs,
 * which Firefox accepts as WebDriver element references.
 *
 * Requires BiDi to be enabled (`firefox.Options#enableBiDi()`). Frames and
 * shadow DOM are not supported yet.
 */
export class BiDiDriver extends SeleniumDriver {
  platform = "firefox" as const;

  @span("driver.fetch_accessibility_tree", BaseDriver.spanAttrs)
  protected override async fetchAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.driver.switchTo().defaultContent();
    // A new tab might take the foreground and leave the current one hidden.
    const context = await this.driver.getWindowHandle();
    await this.driver.switchTo().window(context);

    logger.debug("Waiting for page to load before getting accessibility tree");
    await this.waitForPageToLoad();
    logger.debug("Page loaded, retrieving accessibility tree");

    let result = await this.#callInSandbox(context, SNAPSHOT_FUNCTION);
    if (result.type === "null") {
      logger.debug("Acquiescence is not preloaded, loading it into the page");
      await this.#callInSandbox(context, ACQUIESCENCE_FUNCTION);
      result = await this.#callInSandbox(context, SNAPSHOT_FUNCTION);
    }

    const [snapshotValue, elementsValue] = result.value as [
      BiDiRemoteValue,
      BiDiRemoteValue,
    ];
    const { root, refs, values } = JSON.parse(
      snapshotValue.value as string,
    ) as {
      root: AriaAccessibilityTree.Node;
      refs: string[];
      values: Record<string, string>;
    };
    const elements = elementsValue.value as BiDiRemoteValue[];

    const sharedIds: Record<string, string> = {};
    refs.forEach((ref, index) => {
      const sharedId = elements[index]?.sharedId;
      if (sharedId) sharedIds[ref] = sharedId;
    });
    logger.debug(`Accessibility snapshot has ${refs.length} referenced nodes`);

    return new AriaAccessibilityTree({ root, sharedIds, values });
  }

  @span("driver.find_element", BaseDriver.spanAttrs)
  override async findElement(id: number): Promise<WebElement> {
    const tree = await this.getAccessibilityTree();
    const { sharedId } = await tree.elementById(id);
    if (!sharedId) {
      throw new Error(`Element with raw_id=${id} has no shared ID`);
    }

    // Snapshots only cover the top-level document.
    await this.driver.switchTo().defaultContent();
    return new WebElement(this.driver, sharedId);
  }

  @span("driver.screenshot", BaseDriver.spanAttrs)
  override async screenshot(): Promise<string> {
    if (!this.fullPageScreenshot) return await this.driver.takeScreenshot();

    const { data } = (await this.#sendBiDiCommand(
      "browsingContext.captureScreenshot",
      { context: await this.driver.getWindowHandle(), origin: "document" },
    )) as BiDiDataResponse;

    return data;
  }

  @span("driver.print_to_pdf", BaseDriver.spanAttrs)
  override async printToPdf(filepath: string): Promise<void> {
    const { data } = (await this.#sendBiDiCommand("browsingContext.print", {
      context: await this.driver.getWindowHandle(),
    })) as BiDiDataResponse;

    await fs.writeFile(filepath, Buffer.from(data, "base64"));
  }

  /**
   * GeckoDriver doesn't wait for navigations started by actions.
   * Same-document navigations aren't waited for.
   */
  protected override async withNavigationWait<Result>(
    fn: () => Promise<Result>,
  ): Promise<Result> {
    await this.pageScriptsReady;
    const bidi = await this.driver.getBidi();

    // Navigations are given a moment to start after the action, extended for
    // new tabs, which start blank and only navigate after being created.
    let startDeadline = Infinity;
    const navigating = new Set<string>();
    const listeners: Record<string, (event: BiDiContextEvent) => void> = {
      "browsingContext.contextCreated": () => {
        startDeadline = Math.max(
          startDeadline,
          Date.now() + NAVIGATION_START_TIMEOUT_MS,
        );
      },
      "browsingContext.navigationStarted": ({ context }) =>
        navigating.add(context),
      "browsingContext.load": ({ context }) => navigating.delete(context),
      "browsingContext.navigationAborted": ({ context }) =>
        navigating.delete(context),
      "browsingContext.navigationFailed": ({ context }) =>
        navigating.delete(context),
      "browsingContext.contextDestroyed": ({ context }) =>
        navigating.delete(context),
    };

    for (const [event, listener] of Object.entries(listeners)) {
      bidi.on(event, listener);
    }

    try {
      const result = await fn();

      const now = Date.now();
      startDeadline =
        startDeadline === Infinity
          ? now + NAVIGATION_START_TIMEOUT_MS
          : Math.max(startDeadline, now + NAVIGATION_START_TIMEOUT_MS);
      const loadDeadline = now + NAVIGATION_LOAD_TIMEOUT_MS;
      while (navigating.size || Date.now() < startDeadline) {
        if (Date.now() > loadDeadline) {
          logger.warn(
            `Timed out waiting for navigation to load in ${navigating.size} tab(s)`,
          );
          break;
        }
        await sleep(NAVIGATION_POLL_INTERVAL_MS);
      }

      return result;
    } finally {
      for (const [event, listener] of Object.entries(listeners))
        bidi.off(event, listener);
    }
  }

  protected override async initPageScripts(): Promise<void> {
    // Installed first, as the waiter must be in place before pages load.
    try {
      await this.#sendBiDiCommand("script.addPreloadScript", {
        functionDeclaration: `() => {\n${waiterScriptSource}\n}`,
      });
    } catch (error) {
      logger.debug(
        `Could not install waiter script through BiDi: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await Promise.all(
      NAVIGATION_EVENTS.map(async (event) => {
        try {
          await this.#sendBiDiCommand("session.subscribe", { events: [event] });
        } catch (error) {
          logger.debug(
            `Could not subscribe to ${event} through BiDi: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    try {
      await this.#sendBiDiCommand("script.addPreloadScript", {
        functionDeclaration: ACQUIESCENCE_FUNCTION,
        sandbox: SANDBOX,
      });
    } catch (error) {
      logger.debug(
        `Could not preload acquiescence through BiDi: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async #callInSandbox(
    context: string,
    functionDeclaration: string,
  ): Promise<BiDiRemoteValue> {
    const response = (await this.#sendBiDiCommand("script.callFunction", {
      functionDeclaration,
      awaitPromise: false,
      target: { context, sandbox: SANDBOX },
      resultOwnership: "none",
      serializationOptions: { maxDomDepth: 0 },
    })) as BiDiCallFunctionResponse;

    if (response.type === "exception" || !response.result) {
      throw new Error(
        `Failed to take accessibility snapshot: ${response.exceptionDetails?.text ?? "unknown error"}`,
      );
    }

    return response.result;
  }

  async #sendBiDiCommand(
    method: string,
    params: object,
  ): Promise<BiDiCallFunctionResponse | BiDiDataResponse | undefined> {
    const capabilities = await this.driver.getCapabilities();
    if (!capabilities.get("webSocketUrl")) {
      throw new Error(
        "Firefox support requires WebDriver BiDi, enable it with `new firefox.Options().enableBiDi()`",
      );
    }

    const bidi = await this.driver.getBidi();
    const response = (await bidi.send({ method, params })) as {
      result?: BiDiCallFunctionResponse | BiDiDataResponse;
      error?: string;
      message?: string;
    };
    if (response.error) {
      throw new Error(
        `BiDi ${method} failed: ${response.message ?? response.error}`,
      );
    }
    return response.result;
  }

  //#region Dev

  protected override devDrillProbeTree(): Promise<number> {
    return Promise.reject(
      new TreeDevDrillError(
        "resolve",
        new Error("Tree development drill is unsupported for firefox"),
      ),
    );
  }

  //#endregion
}
