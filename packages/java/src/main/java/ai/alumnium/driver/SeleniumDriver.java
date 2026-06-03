package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;
import ai.alumnium.tool.DragAndDropTool;
import ai.alumnium.tool.HoverTool;
import ai.alumnium.tool.PressKeyTool;
import ai.alumnium.tool.TypeTool;
import ai.alumnium.tool.UploadTool;
import ai.alumnium.util.Retry;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chromium.HasCdp;
import org.openqa.selenium.interactions.Actions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Selenium implementation of {@link BaseDriver}. */
public final class SeleniumDriver extends BaseDriver {

  private static final Logger LOG = LoggerFactory.getLogger(SeleniumDriver.class);

  private static final String WAITER_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waiter.js");
  private static final String WAIT_FOR_SCRIPT =
      loadScript("/ai/alumnium/driver/scripts/waitFor.js");

  private final WebDriver driver;
  private final HasCdp cdp;
  private Map<Integer, Integer> shadowChildToHostMap = new HashMap<>();
  public boolean autoswitchToNewTab = true;
  public boolean fullPageScreenshot = Config.FULL_PAGE_SCREENSHOT;
  public final Set<Class<? extends BaseTool>> supportedTools =
      Set.of(
          ClickTool.class,
          DragAndDropTool.class,
          HoverTool.class,
          PressKeyTool.class,
          TypeTool.class,
          UploadTool.class);

  public SeleniumDriver(WebDriver driver) {
    this.driver = driver;
    if (!(driver instanceof HasCdp hasCdp)) {
      throw new IllegalArgumentException(
          "SeleniumDriver requires a Chromium-family driver that implements HasCdp");
    }
    this.cdp = hasCdp;
    enableTargetAutoAttach();
  }

  @Override
  public String platform() {
    return "chromium";
  }

  @Override
  public Set<Class<? extends BaseTool>> supportedTools() {
    return supportedTools;
  }

  @Override
  public ChromiumAccessibilityTree accessibilityTree() {
    driver.switchTo().defaultContent();
    waitForPageToLoad();

    Map<String, Object> frameTreeResp = executeCdp("Page.getFrameTree", Map.of());
    @SuppressWarnings("unchecked")
    Map<String, Object> frameTree = (Map<String, Object>) frameTreeResp.get("frameTree");
    List<String> frameIds = collectFrameIds(frameTree);
    String mainFrameId = frameId(frameTree);
    LOG.debug("Found {} frames", frameIds.size());

    Map<String, Integer> frameToIframeMap = new HashMap<>();
    Map<String, String> frameParentMap = new HashMap<>();
    buildFrameHierarchy(frameTree, mainFrameId, frameToIframeMap, frameParentMap, null);

    List<Map<String, Object>> allNodes = new ArrayList<>();
    for (String frameId : frameIds) {
      try {
        Map<String, Object> resp =
            executeCdp("Accessibility.getFullAXTree", Map.of("frameId", frameId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> nodes =
            (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
        List<Integer> chain = frameChain(frameId, frameToIframeMap, frameParentMap);
        for (Map<String, Object> node : nodes) {
          if (!chain.isEmpty()) {
            node.put("_frame_chain", chain);
          }
          allNodes.add(node);
        }
      } catch (RuntimeException e) {
        LOG.debug("Frame {} failed", frameId, e);
      }
    }

    LOG.debug("Total accessibility nodes collected: {}", allNodes.size());

    // Collect shadow DOM nodes from the main frame
    // Note: Shadow DOM piercing for iframes would require additional per-frame handling
    try {
      List<Map<String, Object>> shadowNodes = getShadowDomNodes();
      allNodes.addAll(shadowNodes);
      if (!shadowNodes.isEmpty()) {
        LOG.debug("  -> Shadow DOM: {} nodes added", shadowNodes.size());
      }
    } catch (RuntimeException e) {
      LOG.debug("  -> Shadow DOM failed", e);
    }

    Map<String, Object> cdpResponse = new LinkedHashMap<>();
    cdpResponse.put("nodes", allNodes);
    return new ChromiumAccessibilityTree(cdpResponse);
  }

  // region Actions

  @Override
  public void click(int id) {
    withTabAutoswitch(
        () -> {
          WebElement element = findElement(id);
          try {
            new Actions(driver).moveToElement(element).click().perform();
          } catch (RuntimeException e) {
            element.click();
          }
        });
  }

  @Override
  public void dragSlider(int id, double value) {
    WebElement element = findElement(id);
    ((JavascriptExecutor) driver)
        .executeScript(
            "arguments[0].value = arguments[1];arguments[0].dispatchEvent(new"
                + " Event('input', {bubbles: true}));arguments[0].dispatchEvent(new"
                + " Event('change', {bubbles: true}));",
            element,
            Double.toString(value));
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    new Actions(driver).dragAndDrop(findElement(fromId), findElement(toId)).perform();
  }

  @Override
  public void hover(int id) {
    new Actions(driver).moveToElement(findElement(id)).perform();
  }

  @Override
  public void pressKey(Key key) {
    withTabAutoswitch(
        () -> {
          CharSequence keyStroke =
              switch (key) {
                case BACKSPACE -> org.openqa.selenium.Keys.BACK_SPACE;
                case ENTER -> org.openqa.selenium.Keys.ENTER;
                case ESCAPE -> org.openqa.selenium.Keys.ESCAPE;
                case TAB -> org.openqa.selenium.Keys.TAB;
              };
          new Actions(driver).sendKeys(keyStroke).perform();
        });
  }

  @Override
  public void quit() {
    driver.quit();
  }

  @Override
  public void back() {
    driver.navigate().back();
  }

  @Override
  public void visit(String url) {
    driver.get(url);
  }

  @Override
  public String screenshot() {
    if (fullPageScreenshot) {
      Map<String, Object> data =
          executeCdp(
              "Page.captureScreenshot", Map.of("format", "png", "captureBeyondViewport", true));
      return String.valueOf(data.getOrDefault("data", ""));
    }
    return ((org.openqa.selenium.TakesScreenshot) driver)
        .getScreenshotAs(org.openqa.selenium.OutputType.BASE64);
  }

  @Override
  public void scrollTo(int id) {
    ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView();", findElement(id));
  }

  @Override
  public String title() {
    return driver.getTitle();
  }

  @Override
  public void type(int id, String text) {
    WebElement element = findElement(id);
    element.clear();
    element.sendKeys(text);
  }

  @Override
  public void upload(int id, List<String> paths) {
    WebElement element = findElement(id);
    element.sendKeys(String.join("\n", paths));
  }

  @Override
  public String url() {
    return driver.getCurrentUrl();
  }

  @Override
  public String app() {
    try {
      String host = URI.create(driver.getCurrentUrl()).getHost();
      return host == null ? "unknown" : host;
    } catch (RuntimeException e) {
      return "unknown";
    }
  }

  @Override
  public WebElement findElement(int id) {
    var element = accessibilityTree().elementById(id);
    Integer backendNodeId = element.backendNodeId();
    if (backendNodeId == null) {
      throw new IllegalStateException("Element " + id + " has no backendNodeId");
    }
    List<Integer> chain = element.frameChain();
    if (chain != null && !chain.isEmpty()) {
      switchToFrameChain(chain);
    }
    executeCdp("DOM.enable", Map.of());
    executeCdp("DOM.getFlattenedDocument", Map.of());
    Map<String, Object> pushed =
        executeCdp(
            "DOM.pushNodesByBackendIdsToFrontend",
            Map.of("backendNodeIds", List.of(backendNodeId)));
    @SuppressWarnings("unchecked")
    List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
    if (nodeIds == null || nodeIds.isEmpty()) {
      throw new IllegalStateException("CDP did not return a node id for " + backendNodeId);
    }
    Number nodeId = nodeIds.get(0);
    executeCdp(
        "DOM.setAttributeValue",
        Map.of("nodeId", nodeId, "name", "data-alumnium-id", "value", backendNodeId.toString()));
    String selector = "[data-alumnium-id='" + backendNodeId + "']";
    Integer hostBackendNodeId = shadowChildToHostMap.get(backendNodeId);
    WebElement webElement;
    if (hostBackendNodeId != null) {
      // Shadow DOM element: find the shadow host, get its shadow root, search inside
      @SuppressWarnings("unchecked")
      List<Number> hostNodeIds =
          (List<Number>)
              executeCdp(
                      "DOM.pushNodesByBackendIdsToFrontend",
                      Map.of("backendNodeIds", List.of(hostBackendNodeId)))
                  .get("nodeIds");
      if (hostNodeIds == null || hostNodeIds.isEmpty()) {
        throw new IllegalStateException(
            "CDP did not return a node id for host " + hostBackendNodeId);
      }
      Number hostNodeId = hostNodeIds.get(0);
      executeCdp(
          "DOM.setAttributeValue",
          Map.of(
              "nodeId",
              hostNodeId,
              "name",
              "data-alumnium-host",
              "value",
              hostBackendNodeId.toString()));
      WebElement hostElement;
      try {
        hostElement =
            driver.findElement(By.cssSelector("[data-alumnium-host='" + hostBackendNodeId + "']"));
      } finally {
        executeCdp(
            "DOM.removeAttribute", Map.of("nodeId", hostNodeId, "name", "data-alumnium-host"));
      }
      webElement = hostElement.getShadowRoot().findElement(By.cssSelector(selector));
    } else {
      // Regular DOM element: standard CSS selector
      webElement = driver.findElement(By.cssSelector(selector));
    }
    executeCdp("DOM.removeAttribute", Map.of("nodeId", nodeId, "name", "data-alumnium-id"));
    return webElement;
  }

  @Override
  public void executeScript(String script) {
    ((JavascriptExecutor) driver).executeScript(script);
  }

  @Override
  public void switchToNextTab() {
    List<String> handles = new ArrayList<>(driver.getWindowHandles());
    if (handles.size() <= 1) return;
    String current = driver.getWindowHandle();
    int idx = handles.indexOf(current);
    driver.switchTo().window(handles.get((idx + 1) % handles.size()));
  }

  @Override
  public void switchToPreviousTab() {
    List<String> handles = new ArrayList<>(driver.getWindowHandles());
    if (handles.size() <= 1) return;
    String current = driver.getWindowHandle();
    int idx = handles.indexOf(current);
    driver.switchTo().window(handles.get((idx - 1 + handles.size()) % handles.size()));
  }

  @Override
  public void printToPdf(String filepath) {
    Map<String, Object> resp = executeCdp("Page.printToPDF", Map.of());
    Object data = resp.get("data");
    if (data == null) {
      throw new IllegalStateException("Page.printToPDF returned no data");
    }
    try {
      Files.write(Path.of(filepath), Base64.getDecoder().decode(data.toString()));
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Failed to write PDF to " + filepath, e);
    }
  }

  // endregion
  // region Internals

  private void switchToFrameChain(List<Integer> chain) {
    driver.switchTo().defaultContent();
    for (Integer iframeBackendId : chain) {
      executeCdp("DOM.enable", Map.of());
      executeCdp("DOM.getFlattenedDocument", Map.of());
      Map<String, Object> pushed =
          executeCdp(
              "DOM.pushNodesByBackendIdsToFrontend",
              Map.of("backendNodeIds", List.of(iframeBackendId)));
      @SuppressWarnings("unchecked")
      List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
      if (nodeIds == null || nodeIds.isEmpty()) continue;
      Number nodeId = nodeIds.get(0);
      executeCdp(
          "DOM.setAttributeValue",
          Map.of(
              "nodeId",
              nodeId,
              "name",
              "data-alumnium-iframe-id",
              "value",
              iframeBackendId.toString()));
      WebElement iframe =
          driver.findElement(By.cssSelector("[data-alumnium-iframe-id='" + iframeBackendId + "']"));
      executeCdp(
          "DOM.removeAttribute", Map.of("nodeId", nodeId, "name", "data-alumnium-iframe-id"));
      driver.switchTo().frame(iframe);
    }
  }

  private Map<String, Object> executeCdp(String command, Map<String, Object> args) {
    Map<String, Object> result = cdp.executeCdpCommand(command, args);
    return result == null ? Map.of() : result;
  }

  private void enableTargetAutoAttach() {
    try {
      executeCdp(
          "Target.setAutoAttach",
          Map.of("autoAttach", true, "waitForDebuggerOnStart", false, "flatten", true));
    } catch (RuntimeException e) {
      LOG.debug("Could not enable Target.setAutoAttach", e);
    }
  }

  private void waitForPageToLoad() {
    Retry.Options options = new Retry.Options();
    options.maxAttempts = 2;
    options.backOffMillis = 0L;
    try {
      Retry.execute(
          options,
          () -> {
            ((JavascriptExecutor) driver).executeScript(WAITER_SCRIPT);
            Object err = ((JavascriptExecutor) driver).executeAsyncScript(WAIT_FOR_SCRIPT);
            if (err != null) {
              LOG.debug("Failed to wait for page: {}", err);
            }
            return null;
          });
    } catch (RuntimeException e) {
      LOG.debug("waitForPageToLoad threw after retry", e);
    }
  }

  private void withTabAutoswitch(Runnable action) {
    if (!autoswitchToNewTab) {
      action.run();
      return;
    }
    List<String> before = new ArrayList<>(driver.getWindowHandles());
    action.run();
    List<String> after = new ArrayList<>(driver.getWindowHandles());
    after.removeAll(before);
    if (!after.isEmpty()) {
      String newest = after.get(after.size() - 1);
      if (!newest.equals(driver.getWindowHandle())) {
        driver.switchTo().window(newest);
      }
    }
  }

  private static String frameId(Map<String, Object> frameInfo) {
    @SuppressWarnings("unchecked")
    Map<String, Object> frame = (Map<String, Object>) frameInfo.get("frame");
    return frame == null ? "" : String.valueOf(frame.get("id"));
  }

  private static List<String> collectFrameIds(Map<String, Object> frameInfo) {
    List<String> out = new ArrayList<>();
    out.add(frameId(frameInfo));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> children = (List<Map<String, Object>>) frameInfo.get("childFrames");
    if (children != null) {
      for (Map<String, Object> child : children) {
        out.addAll(collectFrameIds(child));
      }
    }
    return out;
  }

  private void buildFrameHierarchy(
      Map<String, Object> frameInfo,
      String mainFrameId,
      Map<String, Integer> frameToIframeMap,
      Map<String, String> frameParentMap,
      String parentFrameId) {
    String id = frameId(frameInfo);
    if (!id.equals(mainFrameId)) {
      try {
        executeCdp("DOM.enable", Map.of());
        Map<String, Object> owner = executeCdp("DOM.getFrameOwner", Map.of("frameId", id));
        Object backend = owner.get("backendNodeId");
        if (backend instanceof Number n) {
          frameToIframeMap.put(id, n.intValue());
        }
      } catch (RuntimeException e) {
        LOG.debug("Could not get frame owner for {}", id, e);
      }
      if (parentFrameId != null) {
        frameParentMap.put(id, parentFrameId);
      }
    }
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> children = (List<Map<String, Object>>) frameInfo.get("childFrames");
    if (children != null) {
      for (Map<String, Object> child : children) {
        buildFrameHierarchy(child, mainFrameId, frameToIframeMap, frameParentMap, id);
      }
    }
  }

  /**
   * Get shadow DOM nodes from the page using CDP. Pierces into shadow roots to make shadow DOM
   * elements accessible. Also rebuilds {@code shadowChildToHostMap} for efficient element lookup.
   */
  private List<Map<String, Object>> getShadowDomNodes() {
    List<Map<String, Object>> shadowNodes = new ArrayList<>();
    Set<String> processed = new HashSet<>();

    executeCdp("DOM.enable", Map.of());

    Map<String, Object> domResp =
        executeCdp("DOM.getFlattenedDocument", Map.of("depth", -1, "pierce", true));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> domNodes =
        (List<Map<String, Object>>) domResp.getOrDefault("nodes", List.of());
    if (domNodes.isEmpty()) return shadowNodes;

    Map<Integer, Integer> nodeIdToBackendId = new HashMap<>();
    Map<Integer, Integer> parentIdMap = new HashMap<>();
    Map<Integer, Integer> shadowRootToHostBackendId = new HashMap<>();

    for (Map<String, Object> domNode : domNodes) {
      Integer nodeId = toInteger(domNode.get("nodeId"));
      Integer backendNodeId = toInteger(domNode.get("backendNodeId"));
      if (nodeId != null && backendNodeId != null) {
        nodeIdToBackendId.put(nodeId, backendNodeId);
      }
      Integer parentId = toInteger(domNode.get("parentId"));
      if (parentId != null && nodeId != null) {
        parentIdMap.put(nodeId, parentId);
      }
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> shadowRoots =
          (List<Map<String, Object>>) domNode.get("shadowRoots");
      if (shadowRoots != null && backendNodeId != null) {
        for (Map<String, Object> sr : shadowRoots) {
          Integer srNodeId = toInteger(sr.get("nodeId"));
          if (srNodeId != null) {
            shadowRootToHostBackendId.put(srNodeId, backendNodeId);
            if (nodeId != null) {
              parentIdMap.put(srNodeId, nodeId);
            }
          }
        }
      }
    }

    // Build childBackendNodeId -> hostBackendNodeId map by walking parent chains
    shadowChildToHostMap = new HashMap<>();
    for (Map<String, Object> domNode : domNodes) {
      Integer nodeBackendId = toInteger(domNode.get("backendNodeId"));
      if (nodeBackendId == null) continue;
      Integer currentId = toInteger(domNode.get("nodeId"));
      while (currentId != null) {
        if (shadowRootToHostBackendId.containsKey(currentId)) {
          shadowChildToHostMap.put(nodeBackendId, shadowRootToHostBackendId.get(currentId));
          break;
        }
        currentId = parentIdMap.get(currentId);
      }
    }

    // Find shadow hosts and collect their accessibility nodes
    for (Map<String, Object> domNode : domNodes) {
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> shadowRoots =
          (List<Map<String, Object>>) domNode.get("shadowRoots");
      if (shadowRoots == null || shadowRoots.isEmpty()) continue;
      try {
        Map<String, Object> axResp =
            executeCdp("Accessibility.queryAXTree", Map.of("nodeId", domNode.get("nodeId")));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> axNodes =
            (List<Map<String, Object>>) axResp.getOrDefault("nodes", List.of());
        for (Map<String, Object> axNode : axNodes) {
          String axNodeId = String.valueOf(axNode.get("nodeId"));
          if (processed.contains(axNodeId)) continue;
          processed.add(axNodeId);

          axNode.put("_is_shadow_dom", true);
          if (axNode.get("backendDOMNodeId") == null) {
            Integer bid = nodeIdToBackendId.get(toInteger(axNode.get("nodeId")));
            if (bid != null) axNode.put("backendDOMNodeId", bid);
          }
          shadowNodes.add(axNode);

          @SuppressWarnings("unchecked")
          List<Object> childIds = (List<Object>) axNode.get("childIds");
          if (childIds != null) {
            for (Object childId : childIds) {
              shadowNodes.addAll(
                  getShadowChildNodes(toInteger(childId), processed, nodeIdToBackendId));
            }
          }
        }
      } catch (RuntimeException e) {
        // Ignore errors for individual shadow hosts
      }
    }
    return shadowNodes;
  }

  /** Recursively get child nodes from shadow DOM. */
  private List<Map<String, Object>> getShadowChildNodes(
      Integer nodeId, Set<String> processed, Map<Integer, Integer> nodeIdToBackendId) {
    List<Map<String, Object>> nodes = new ArrayList<>();
    if (nodeId == null) return nodes;
    String key = nodeId.toString();
    if (processed.contains(key)) return nodes;
    processed.add(key);

    try {
      Map<String, Object> resp = executeCdp("Accessibility.queryAXTree", Map.of("nodeId", nodeId));
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> axNodes =
          (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
      for (Map<String, Object> node : axNodes) {
        node.put("_is_shadow_dom", true);
        if (node.get("backendDOMNodeId") == null) {
          Integer bid = nodeIdToBackendId.get(toInteger(node.get("nodeId")));
          if (bid != null) node.put("backendDOMNodeId", bid);
        }
        nodes.add(node);

        @SuppressWarnings("unchecked")
        List<Object> childIds = (List<Object>) node.get("childIds");
        if (childIds != null) {
          for (Object childId : childIds) {
            nodes.addAll(getShadowChildNodes(toInteger(childId), processed, nodeIdToBackendId));
          }
        }
      }
    } catch (RuntimeException e) {
      // Ignore errors for individual nodes
    }
    return nodes;
  }

  private static List<Integer> frameChain(
      String frameId, Map<String, Integer> frameToIframeMap, Map<String, String> frameParentMap) {
    List<Integer> chain = new ArrayList<>();
    String current = frameId;
    while (frameToIframeMap.containsKey(current)) {
      chain.add(0, frameToIframeMap.get(current));
      current = frameParentMap.getOrDefault(current, null);
      if (current == null) break;
    }
    return chain;
  }

  private static Integer toInteger(Object value) {
    if (value == null) return null;
    if (value instanceof Number n) return n.intValue();
    try {
      return Integer.parseInt(value.toString());
    } catch (NumberFormatException e) {
      return null;
    }
  }

  // endregion
}
