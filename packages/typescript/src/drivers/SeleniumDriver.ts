import * as fs from "fs/promises"

import {
  By,
  Key as SeleniumKey,
  WebDriver,
  WebElement,
} from "selenium-webdriver"
import {
  ElementNotInteractableError,
  NoSuchSessionError,
} from "selenium-webdriver/lib/error.js"

import { always } from "alwaysly"
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts"
import { ChromiumAccessibilityTree } from "../accessibility/ChromiumAccessibilityTree.ts"
import type { ToolClass } from "../tools/BaseTool.ts"
import { ClickTool } from "../tools/ClickTool.ts"
import { DragAndDropTool } from "../tools/DragAndDropTool.ts"
import { HoverTool } from "../tools/HoverTool.ts"
import { PressKeyTool } from "../tools/PressKeyTool.ts"
import { TypeTool } from "../tools/TypeTool.ts"
import { UploadTool } from "../tools/UploadTool.ts"
import { getLogger } from "../utils/logger.ts"
import { BaseDriver } from "./BaseDriver.ts"
import { Keys } from "./keys.ts"
// NOTE: While macros work well in Bun, it fails when using Alumium client from
// Node.js. A solution could be "node:sea" module, but current Bun version
// doesn't support it. For now, we bundle assets with scripts/generate.ts.
// import { readScript } from "./scripts/scripts.js" with { type: "macro" };
import type { ChromiumWebDriver } from "selenium-webdriver/chromium.js"
import { AppId } from "../AppId.ts"
import type { Driver } from "./Driver.ts"
import {
  waiterScriptSource,
  waitForScriptSource,
} from "./scripts/bundledScripts.ts"

interface CDPNode {
  nodeId: string
  parentId?: string
  _parent_iframe_backend_node_id?: number
  _frame_chain?: number[]
  [key: string]: unknown
}

interface CDPFrameInfo {
  frame: {
    id: string
    url: string
  }
  childFrames?: CDPFrameInfo[]
}

const logger = getLogger(import.meta.url)

const WAITER_SCRIPT = waiterScriptSource
const WAIT_FOR_SCRIPT = waitForScriptSource

export class SeleniumDriver extends BaseDriver {
  protected driver: ChromiumWebDriver
  public platform: Driver.Platform = "chromium"
  #autoswitchToNewTabEnabled: boolean = true
  public fullPageScreenshot: boolean =
    (process.env.ALUMNIUM_FULL_PAGE_SCREENSHOT || "false").toLowerCase() ===
    "true"
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    TypeTool,
    UploadTool,
  ])

  constructor(driver: WebDriver) {
    super()
    this.driver = (driver as ChromiumWebDriver)
  }

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    const alert = await this.detectAlert()

    // WebDriver commands (switchTo, executeScript) fail when an alert is open,
    // but CDP commands still work since they use the DevTools protocol directly.
    if (!alert) {
      await this.driver.switchTo().defaultContent()
      logger.debug("Waiting for page to load before getting accessibility tree")
      await this.waitForPageToLoad()
      logger.debug("Page loaded, retrieving accessibility tree")
    }

    // Get frame tree to enumerate all frames
    const frameTree = (await this.executeCdpCommand(
      "Page.getFrameTree",
      {},
    )) as {
      frameTree: CDPFrameInfo
    }
    const frameIds = this.getAllFrameIds(frameTree.frameTree)
    const mainFrameId = frameTree.frameTree.frame.id
    logger.debug(`Found ${frameIds.length} frames`)

    // Build mapping: frameId -> backendNodeId of the iframe element containing the frame
    const frameToIframeMap: Map<string, number> = new Map()
    // Build mapping: frameId -> parent frameId (for nested frames)
    const frameParentMap: Map<string, string> = new Map()
    await this.buildFrameHierarchy(
      frameTree.frameTree,
      mainFrameId,
      frameToIframeMap,
      frameParentMap,
    )

    // Aggregate accessibility nodes from all frames
    const allNodes: CDPNode[] = []
    for (const frameId of frameIds) {
      try {
        const response = (await this.executeCdpCommand(
          "Accessibility.getFullAXTree",
          { frameId },
        )) as { nodes: CDPNode[] }
        const nodes = response.nodes || []
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: ${nodes.length} nodes`,
        )
        // Tag ALL nodes from child frames with their frame chain (list of iframe backendNodeIds)
        // This allows us to switch through nested frames when finding elements
        const frameChain = this.getFrameChain(
          frameId,
          frameToIframeMap,
          frameParentMap,
        )
        for (const node of nodes) {
          if (frameChain.length > 0) {
            node._frame_chain = frameChain
          }
        }
        allNodes.push(...nodes)
      } catch (error) {
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: failed (${
            error instanceof Error ? error.message : String(error)
          })`,
        )
      }
    }

    // Append alert synthetic nodes so the LLM can see and interact with the dialog
    if (alert) {
      allNodes.push(...SeleniumDriver.createAlertNodes(alert.text))
    }

    logger.debug(`Total accessibility nodes collected: ${allNodes.length}`)

    return new ChromiumAccessibilityTree({ nodes: allNodes })
  }

  private async buildFrameHierarchy(
    frameInfo: CDPFrameInfo,
    mainFrameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>,
    parentFrameId?: string,
  ): Promise<void> {
    const frameId = frameInfo.frame.id

    if (frameId !== mainFrameId) {
      // Get the iframe element that owns this frame
      await this.executeCdpCommand("DOM.enable", {})
      try {
        const ownerInfo = (await this.executeCdpCommand("DOM.getFrameOwner", {
          frameId,
        })) as { backendNodeId: number }
        frameToIframeMap.set(frameId, ownerInfo.backendNodeId)
        logger.debug(
          `Frame ${frameId.slice(0, 20)}... owned by iframe backendNodeId=${ownerInfo.backendNodeId}`,
        )
      } catch (error) {
        logger.debug(
          `Could not get frame owner for ${frameId.slice(0, 20)}...: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }

      // Track parent frame
      if (parentFrameId) {
        frameParentMap.set(frameId, parentFrameId)
      }
    }

    // Process children
    for (const child of frameInfo.childFrames || []) {
      await this.buildFrameHierarchy(
        child,
        mainFrameId,
        frameToIframeMap,
        frameParentMap,
        frameId,
      )
    }
  }

  private getFrameChain(
    frameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>,
  ): number[] {
    const chain: number[] = []
    let currentFrameId = frameId

    while (frameToIframeMap.has(currentFrameId)) {
      const iframeBackendNodeId = frameToIframeMap.get(currentFrameId)!
      chain.unshift(iframeBackendNodeId) // Insert at beginning to build from root
      // Move to parent frame
      if (frameParentMap.has(currentFrameId)) {
        currentFrameId = frameParentMap.get(currentFrameId)!
      } else {
        break
      }
    }

    return chain
  }

  private getAllFrameIds(frameInfo: CDPFrameInfo): string[] {
    const frameIds: string[] = [frameInfo.frame.id]
    for (const child of frameInfo.childFrames || []) {
      frameIds.push(...this.getAllFrameIds(child))
    }
    return frameIds
  }

  async click(id: number): Promise<void> {
    const tree = await this.getAccessibilityTree()
    const accessibilityElement = tree.elementById(id)
    if (accessibilityElement.alertAction) {
      const alert = await this.driver.switchTo().alert()
      if (accessibilityElement.alertAction === "accept") {
        await alert.accept()
      } else if (accessibilityElement.alertAction === "dismiss") {
        await alert.dismiss()
      }
      return
    }

    return this.#autoswitchToNewTab(async () => {
      const element = await this.findElement(id)
      try {
        const actions = this.driver.actions({ async: true })
        await actions.move({ origin: element }).click().perform()
      } catch (error) {
        if (error instanceof ElementNotInteractableError) {
          await element.click()
        } else {
          throw error
        }
      }
    })
  }

  async dragSlider(id: number, value: number): Promise<void> {
    const element = await this.findElement(id)
    await this.driver.executeScript(
      "arguments[0].value = arguments[1];" +
        "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));" +
        "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
      element,
      String(value),
    )
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const actions = this.driver.actions({ async: true })
    await actions
      .dragAndDrop(await this.findElement(fromId), await this.findElement(toId))
      .perform()
  }

  async hover(id: number): Promise<void> {
    const actions = this.driver.actions({ async: true })
    await actions.move({ origin: await this.findElement(id) }).perform()
  }

  pressKey(key: Keys.Key): Promise<void> {
    return this.#autoswitchToNewTab(async () => {
      const keyMap: Record<Keys.Key, string> = {
        Backspace: SeleniumKey.BACK_SPACE,
        Enter: SeleniumKey.ENTER,
        Escape: SeleniumKey.ESCAPE,
        Tab: SeleniumKey.TAB,
      }

      const actions = this.driver.actions({ async: true })
      await actions.sendKeys(keyMap[key]).perform()
    })
  }

  async quit(): Promise<void> {
    try {
      await this.driver.quit()
    } catch (error) {
      if (error instanceof NoSuchSessionError) {
        logger.info("Selenium session already closed, ignoring quit error")
      } else {
        throw error
      }
    }
  }

  async back(): Promise<void> {
    await this.driver.navigate().back()
  }

  async visit(url: string): Promise<void> {
    await this.driver.get(url)
  }

  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id)
    await this.driver.executeScript("arguments[0].scrollIntoView();", element)
  }

  async screenshot(): Promise<string> {
    if (this.fullPageScreenshot) {
      const result = (await this.executeCdpCommand("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      })) as { data: string }
      return result.data
    } else {
      return await this.driver.takeScreenshot()
    }
  }

  title(): Promise<string> {
    return this.driver.getTitle()
  }

  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id)
    await element.clear()
    await element.sendKeys(text)
  }

  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id)
    await element.sendKeys(paths.join("\n"))
  }

  url(): Promise<string> {
    return this.driver.getCurrentUrl()
  }

  async app(): Promise<AppId> {
    const currentUrl = await this.driver.getCurrentUrl()
    return AppId.parse(currentUrl)
  }

  async findElement(id: number): Promise<WebElement> {
    const tree = await this.getAccessibilityTree()
    const accessibilityElement = tree.elementById(id)
    const backendNodeId = accessibilityElement.backendNodeId!
    const frameChain = accessibilityElement.frameChain

    // Switch through the frame chain if element is inside nested iframes
    if (frameChain && frameChain.length > 0) {
      await this.switchToFrameChain(frameChain)
    }

    // Use CDP to find element by backend node ID
    await this.executeCdpCommand("DOM.enable", {})
    await this.executeCdpCommand("DOM.getFlattenedDocument", {})

    const { nodeIds } = (await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      { backendNodeIds: [backendNodeId] },
    )) as { nodeIds: number[] }

    const nodeId = nodeIds[0]

    // Set temporary attribute to locate element
    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-id",
      value: String(backendNodeId),
    })

    const element = await this.driver.findElement(
      By.css(`[data-alumnium-id='${backendNodeId}']`),
    )

    // Remove temporary attribute
    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId,
      name: "data-alumnium-id",
    })

    // Note: We don't switch back to default content here because the element
    // needs to remain in its frame context for subsequent operations (click, type, etc.)

    return element
  }

  private async switchToFrameChain(frameChain: number[]): Promise<void> {
    // First switch to default content to ensure we're at the top level
    await this.driver.switchTo().defaultContent()

    // Switch through each iframe in the chain
    for (const iframeBackendNodeId of frameChain) {
      await this.switchToSingleFrame(iframeBackendNodeId)
    }
  }

  private async switchToSingleFrame(
    iframeBackendNodeId: number,
  ): Promise<void> {
    // Use CDP to find and switch to the iframe
    await this.executeCdpCommand("DOM.enable", {})
    await this.executeCdpCommand("DOM.getFlattenedDocument", {})

    const { nodeIds } = (await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      { backendNodeIds: [iframeBackendNodeId] },
    )) as { nodeIds: number[] }

    const nodeId = nodeIds[0]

    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-iframe-id",
      value: String(iframeBackendNodeId),
    })

    const iframeElement = await this.driver.findElement(
      By.css(`[data-alumnium-iframe-id='${iframeBackendNodeId}']`),
    )

    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId,
      name: "data-alumnium-iframe-id",
    })

    await this.driver.switchTo().frame(iframeElement)
    logger.debug(`Switched to iframe with backendNodeId=${iframeBackendNodeId}`)
  }

  async executeScript(script: string): Promise<void> {
    await this.driver.executeScript(script)
  }

  async printToPdf(filepath: string): Promise<void> {
    const { data } = (await this.executeCdpCommand("Page.printToPDF", {})) as {
      data: string
    }
    await fs.writeFile(filepath, Buffer.from(data, "base64"))
  }

  async switchToNextTab(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles()
    if (handles.length <= 1) return

    const current = await this.driver.getWindowHandle()
    const currentIndex = handles.indexOf(current)
    const nextIndex = (currentIndex + 1) % handles.length

    always(handles[nextIndex])
    await this.driver.switchTo().window(handles[nextIndex])
    logger.debug(
      `Switched to next tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
    )
  }

  async switchToPreviousTab(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles()
    if (handles.length <= 1) return

    const current = await this.driver.getWindowHandle()
    const currentIndex = handles.indexOf(current)
    const prevIndex = (currentIndex - 1 + handles.length) % handles.length

    always(handles[prevIndex])
    await this.driver.switchTo().window(handles[prevIndex])
    logger.debug(
      `Switched to previous tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
    )
  }

  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds))
    await new Promise((resolve) => setTimeout(resolve, clampedSeconds * 1000))
  }

  async waitForSelector(): Promise<void> {
    throw new Error("waitForSelector not supported for this driver")
  }

  private executeCdpCommand(cmd: string, params: object): Promise<unknown> {
    return this.driver.sendAndGetDevToolsCommand(cmd, params)
  }

  private async waitForPageToLoad(): Promise<void> {
    try {
      await this.driver.executeScript(WAITER_SCRIPT)
      const error = await this.driver.executeAsyncScript(WAIT_FOR_SCRIPT)
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        logger.warn(`Failed to wait for page to load: ${String(error)}`)
      }
    } catch {
      // Retry once on failure
      try {
        await this.driver.executeScript(WAITER_SCRIPT)
        const error = await this.driver.executeAsyncScript(WAIT_FOR_SCRIPT)
        if (error) {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          logger.warn(`Failed to wait for page to load: ${String(error)}`)
        }
      } catch (retryError) {
        logger.warn(
          `Failed to wait for page to load after retry: ${String(retryError)}`,
        )
      }
    }
  }

  private async detectAlert(): Promise<{
    text: string
  } | null> {
    try {
      const alert = await this.driver.switchTo().alert()
      return { text: await alert.getText() }
    } catch {
      return null
    }
  }

  private static createAlertNodes(alertText: string): CDPNode[] {
    const dialogId = "-100"
    const acceptId = "-101"
    const dismissId = "-102"

    return [
      {
        nodeId: dialogId,
        role: { value: "alertdialog" },
        name: { value: alertText || "Alert" },
        childIds: [acceptId, dismissId],
      } as CDPNode,
      {
        nodeId: acceptId,
        role: { value: "button" },
        name: { value: "Accept" },
        _alert_action: "accept",
      } as CDPNode,
      {
        nodeId: dismissId,
        role: { value: "button" },
        name: { value: "Dismiss" },
        _alert_action: "dismiss",
      } as CDPNode,
    ]
  }

  async #autoswitchToNewTab<Result,>(
    fn: () => Promise<Result>,
  ): Promise<Result> {
    if (!this.#autoswitchToNewTabEnabled) {
      return await fn()
    }

    let currentHandles: string[]
    try {
      currentHandles = await this.driver.getAllWindowHandles()
    } catch {
      return await fn()
    }

    const result = await fn()

    let newHandles: string[]
    try {
      newHandles = await this.driver.getAllWindowHandles()
    } catch {
      return result
    }
    const newTabs = newHandles.filter((h) => !currentHandles.includes(h))

    if (newTabs.length) {
      const lastNewTab = newTabs[newTabs.length - 1]
      always(lastNewTab)

      if (lastNewTab !== (await this.driver.getWindowHandle())) {
        await this.driver.switchTo().window(lastNewTab)
        logger.debug(
          `Auto-switching to new tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
        )
      }
    }

    return result
  }
}
