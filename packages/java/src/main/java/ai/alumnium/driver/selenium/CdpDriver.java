package ai.alumnium.driver.selenium;

import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import ai.alumnium.driver.SeleniumDriver;
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
import org.openqa.selenium.Capabilities;
import org.openqa.selenium.HasCapabilities;
import org.openqa.selenium.SearchContext;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chromium.HasCdp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Selenium driver for Chromium browsers, which builds accessibility trees over CDP. */
public final class CdpDriver extends SeleniumDriver {

  private static final Logger LOG = LoggerFactory.getLogger(CdpDriver.class);

  private CdpConnection cdpConnection;
  private Map<Long, Long> shadowChildToHostMap = new HashMap<>();

  public CdpDriver(WebDriver driver) {
    super(requireCdp(driver));
    initPageScripts();
  }

  private static WebDriver requireCdp(WebDriver driver) {
    if (!(driver instanceof HasCdp)) {
      throw new IllegalArgumentException(
          "CdpDriver requires a Chromium-family driver that implements HasCdp");
    }
    return driver;
  }

  @Override
  public String platform() {
    return "chromium";
  }

  @Override
  protected ChromiumAccessibilityTree fetchAccessibilityTree() {
    // Switch to default content to ensure we're at the top level for frame enumeration
    driver.switchTo().defaultContent();

    // A new tab might take the foreground and leave the current one hidden.
    driver.switchTo().window(driver.getWindowHandle());

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

    try {
      List<Map<String, Object>> shadowNodes = buildShadowHierarcy();
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
  public WebElement findElement(int id) {
    var element = accessibilityTree().elementById(id);
    Long backendNodeId = element.backendNodeId();
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
    Long hostBackendNodeId = shadowChildToHostMap.get(backendNodeId);

    SearchContext searchContext = driver;
    if (hostBackendNodeId != null) {
      searchContext = findShadowRoot(hostBackendNodeId);
    }
    WebElement webElement = searchContext.findElement(By.cssSelector(selector));

    executeCdp("DOM.removeAttribute", Map.of("nodeId", nodeId, "name", "data-alumnium-id"));
    return webElement;
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
    Map<String, Object> result = ((HasCdp) driver).executeCdpCommand(command, args);
    return result == null ? Map.of() : result;
  }

  @Override
  protected void initPageScripts() {
    try {
      if (!(driver instanceof HasCapabilities hasCapabilities)) {
        throw new IllegalStateException("Selenium driver did not expose capabilities");
      }
      Capabilities capabilities = hasCapabilities.getCapabilities();
      cdpConnection = CdpConnection.connect(capabilities, WAITER_SCRIPT);
    } catch (RuntimeException error) {
      LOG.debug("Could not connect to CDP to inject the waiter script", error);
      executeCdp(
          "Page.addScriptToEvaluateOnNewDocument",
          Map.of("source", WAITER_SCRIPT, "runImmediately", true));
    }
  }

  @Override
  protected void closeConnections() {
    if (cdpConnection != null) cdpConnection.close();
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

  private SearchContext findShadowRoot(Long hostBackendNodeId) {
    @SuppressWarnings("unchecked")
    List<Number> hostNodeIds =
        (List<Number>)
            executeCdp(
                    "DOM.pushNodesByBackendIdsToFrontend",
                    Map.of("backendNodeIds", List.of(hostBackendNodeId)))
                .get("nodeIds");
    if (hostNodeIds == null || hostNodeIds.isEmpty()) {
      throw new IllegalStateException("CDP did not return a node id for host " + hostBackendNodeId);
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
      executeCdp("DOM.removeAttribute", Map.of("nodeId", hostNodeId, "name", "data-alumnium-host"));
    }

    return hostElement.getShadowRoot();
  }

  private List<Map<String, Object>> buildShadowHierarcy() {
    List<Map<String, Object>> shadowNodes = new ArrayList<>();
    Set<String> processed = new HashSet<>();

    executeCdp("DOM.enable", Map.of());

    Map<String, Object> domResp =
        executeCdp("DOM.getFlattenedDocument", Map.of("depth", -1, "pierce", true));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> domNodes =
        (List<Map<String, Object>>) domResp.getOrDefault("nodes", List.of());
    if (domNodes.isEmpty()) return shadowNodes;

    Map<Long, Long> nodeIdToBackendId = new HashMap<>();
    Map<Long, Long> parentIdMap = new HashMap<>();
    Map<Long, Long> shadowRootToHostBackendId = new HashMap<>();

    for (Map<String, Object> domNode : domNodes) {
      Long nodeId = (Long) domNode.get("nodeId");
      Long backendNodeId = (Long) domNode.get("backendNodeId");
      if (nodeId != null && backendNodeId != null) {
        nodeIdToBackendId.put(nodeId, backendNodeId);
      }
      Long parentId = (Long) domNode.get("parentId");
      if (parentId != null && nodeId != null) {
        parentIdMap.put(nodeId, parentId);
      }
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> shadowRoots =
          (List<Map<String, Object>>) domNode.get("shadowRoots");
      if (shadowRoots != null && backendNodeId != null) {
        for (Map<String, Object> sr : shadowRoots) {
          Long srNodeId = (Long) sr.get("nodeId");
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
      Long nodeBackendId = (Long) domNode.get("backendNodeId");
      if (nodeBackendId == null) continue;
      Long currentId = (Long) domNode.get("nodeId");
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
            Long bid = nodeIdToBackendId.get((Long) axNode.get("nodeId"));
            if (bid != null) axNode.put("backendDOMNodeId", bid);
          }
          shadowNodes.add(axNode);

          @SuppressWarnings("unchecked")
          List<Object> childIds = (List<Object>) axNode.get("childIds");
          if (childIds != null) {
            for (Object childId : childIds) {
              shadowNodes.addAll(getShadowChildNodes((Long) childId, processed, nodeIdToBackendId));
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
      Long nodeId, Set<String> processed, Map<Long, Long> nodeIdToBackendId) {
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
          Long bid = nodeIdToBackendId.get((Long) node.get("nodeId"));
          if (bid != null) node.put("backendDOMNodeId", bid);
        }
        nodes.add(node);

        @SuppressWarnings("unchecked")
        List<Long> childIds = (List<Long>) node.get("childIds");
        if (childIds != null) {
          for (Long childId : childIds) {
            nodes.addAll(getShadowChildNodes(childId, processed, nodeIdToBackendId));
          }
        }
      }
    } catch (RuntimeException e) {
      // Ignore errors for individual nodes
    }
    return nodes;
  }
  // endregion
}
