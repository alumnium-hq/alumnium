package ai.alumnium.driver.appium;

import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import ai.alumnium.driver.Key;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chromium.HasCdp;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.interactions.PointerInput;
import org.openqa.selenium.interactions.Sequence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Chromium-context strategy: uses CDP to build the accessibility tree and locate elements. */
public final class ChromiumAppiumViewStrategy implements AppiumViewStrategy {

  private static final Logger LOG = LoggerFactory.getLogger(ChromiumAppiumViewStrategy.class);

  private final AppiumViewContext ctx;
  private final HasCdp cdp;

  public ChromiumAppiumViewStrategy(AppiumViewContext ctx) {
    this.ctx = ctx;
    if (!(ctx.driver() instanceof HasCdp hasCdp)) {
      throw new IllegalStateException(
          "ChromiumAppiumViewStrategy requires the Appium driver to implement HasCdp");
    }
    this.cdp = hasCdp;
  }

  @Override
  public ChromiumAccessibilityTree accessibilityTree() {
    Map<String, Object> frameTreeResp = executeCdp("Page.getFrameTree", Map.of());
    @SuppressWarnings("unchecked")
    Map<String, Object> frameTree = (Map<String, Object>) frameTreeResp.get("frameTree");
    List<String> frameIds = collectFrameIds(frameTree);
    String mainFrameId = frameId(frameTree);
    LOG.debug("Chromium: found {} frames", frameIds.size());

    Map<String, Integer> frameToIframeMap = new HashMap<>();
    buildFrameHierarchy(frameTree, mainFrameId, frameToIframeMap);

    List<Map<String, Object>> allNodes = new ArrayList<>();
    for (String fid : frameIds) {
      try {
        Map<String, Object> resp =
            executeCdp("Accessibility.getFullAXTree", Map.of("frameId", fid));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> nodes =
            (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
        for (Map<String, Object> node : nodes) {
          if (frameToIframeMap.containsKey(fid)) {
            node.put("_parent_iframe_backend_node_id", frameToIframeMap.get(fid));
          }
          allNodes.add(node);
        }
      } catch (RuntimeException e) {
        LOG.debug("Frame {} failed: {}", fid, e.getMessage());
      }
    }

    Map<String, Object> cdpResponse = new LinkedHashMap<>();
    cdpResponse.put("nodes", allNodes);
    return new ChromiumAccessibilityTree(cdpResponse);
  }

  @Override
  public WebElement findRaw(int id) {
    var element = accessibilityTree().elementById(id);
    if (element.locatorInfo() != null) {
      Map<String, Object> locator = element.locatorInfo();
      String selector = String.valueOf(locator.getOrDefault("selector", ""));
      int nth = ((Number) locator.getOrDefault("nth", 0)).intValue();
      List<WebElement> matches = ctx.driver().findElements(By.cssSelector(selector));
      if (nth < matches.size()) return matches.get(nth);
      throw new IllegalStateException("No element for selector " + selector + " nth=" + nth);
    }
    Integer backendNodeId = element.backendNodeId();
    if (backendNodeId == null) {
      throw new IllegalStateException("Element " + id + " has no backendNodeId");
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
      throw new IllegalStateException("CDP returned no node id for backendNodeId=" + backendNodeId);
    }
    Number nodeId = nodeIds.get(0);
    executeCdp(
        "DOM.setAttributeValue",
        Map.of("nodeId", nodeId, "name", "data-alumnium-id", "value", backendNodeId.toString()));
    WebElement webElement =
        ctx.driver().findElement(By.cssSelector("[data-alumnium-id='" + backendNodeId + "']"));
    executeCdp("DOM.removeAttribute", Map.of("nodeId", nodeId, "name", "data-alumnium-id"));
    return webElement;
  }

  @Override
  public void click(int id) {
    WebElement element = findRaw(id);
    try {
      new Actions(ctx.driver()).moveToElement(element).click().perform();
    } catch (RuntimeException e) {
      element.click();
    }
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    WebElement from = findRaw(fromId);
    WebElement to = findRaw(toId);
    int fromX = from.getLocation().getX() + from.getSize().getWidth() / 2;
    int fromY = from.getLocation().getY() + from.getSize().getHeight() / 2;
    int toX = to.getLocation().getX() + to.getSize().getWidth() / 2;
    int toY = to.getLocation().getY() + to.getSize().getHeight() / 2;
    PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
    Sequence drag = new Sequence(finger, 0);
    drag.addAction(
        finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), fromX, fromY));
    drag.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
    drag.addAction(
        finger.createPointerMove(Duration.ofMillis(600), PointerInput.Origin.viewport(), toX, toY));
    drag.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
    ctx.driver().perform(List.of(drag));
  }

  @Override
  public void pressKey(Key key) {
    CharSequence code =
        switch (key) {
          case BACKSPACE -> org.openqa.selenium.Keys.BACK_SPACE;
          case ENTER -> org.openqa.selenium.Keys.ENTER;
          case ESCAPE -> org.openqa.selenium.Keys.ESCAPE;
          case TAB -> org.openqa.selenium.Keys.TAB;
        };
    new Actions(ctx.driver()).sendKeys(code).perform();
  }

  @Override
  public void type(int id, String text) {
    WebElement element = findRaw(id);
    element.clear();
    element.sendKeys(text);
  }

  @Override
  public void scrollTo(int id) {
    ctx.driver().executeScript("arguments[0].scrollIntoView();", findRaw(id));
  }

  @Override
  public String title() {
    try {
      return ctx.driver().getTitle();
    } catch (RuntimeException e) {
      return "";
    }
  }

  @Override
  public String url() {
    try {
      return ctx.driver().getCurrentUrl();
    } catch (RuntimeException e) {
      return "";
    }
  }

  @Override
  public void executeScript(String script) {
    ctx.driver().executeScript(script);
  }

  // region CDP helpers

  private Map<String, Object> executeCdp(String command, Map<String, Object> args) {
    Map<String, Object> result = cdp.executeCdpCommand(command, args);
    return result == null ? Map.of() : result;
  }

  private void buildFrameHierarchy(
      Map<String, Object> frameInfo, String mainFrameId, Map<String, Integer> frameToIframeMap) {
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
        LOG.debug("Could not get frame owner for {}: {}", id, e.getMessage());
      }
    }
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> children = (List<Map<String, Object>>) frameInfo.get("childFrames");
    if (children != null) {
      for (Map<String, Object> child : children) {
        buildFrameHierarchy(child, mainFrameId, frameToIframeMap);
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

  // endregion
}
