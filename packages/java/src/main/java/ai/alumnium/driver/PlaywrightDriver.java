package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;
import ai.alumnium.tool.DragAndDropTool;
import ai.alumnium.tool.HoverTool;
import ai.alumnium.tool.PressKeyTool;
import ai.alumnium.tool.TypeTool;
import ai.alumnium.tool.UploadTool;
import ai.alumnium.util.Retry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.JsonObject;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.CDPSession;
import com.microsoft.playwright.Frame;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.TimeoutError;
import java.net.URI;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Playwright implementation of {@link BaseDriver}. */
public final class PlaywrightDriver extends BaseDriver {

  private static final Logger LOG = LoggerFactory.getLogger(PlaywrightDriver.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static final String WAITER_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waiter.js");
  private static final String WAIT_FOR_SCRIPT =
      loadScript("/ai/alumnium/driver/scripts/waitFor.js");
  private static final String CONTEXT_WAS_DESTROYED_ERROR = "Execution context was destroyed";

  private Page page;
  private CDPSession client;
  private final List<Page> pages = new ArrayList<>();
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

  public PlaywrightDriver(Page page) {
    this.page = page;
    this.client = page.context().newCDPSession(page);
    setupPageTracking(page);
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
    waitForPageToLoad();

    Map<String, Object> frameTreeResp = sendCdp("Page.getFrameTree", null);
    @SuppressWarnings("unchecked")
    Map<String, Object> frameTree = (Map<String, Object>) frameTreeResp.get("frameTree");
    List<String> frameIds = collectFrameIds(frameTree);
    String mainFrameId = frameIdOf(frameTree);
    LOG.debug("Found {} frames", frameIds.size());

    Map<String, Integer> frameToIframeMap = new HashMap<>();
    buildFrameHierarchy(frameTree, mainFrameId, frameToIframeMap);

    Map<String, Frame> frameIdToFrame = new HashMap<>();
    for (Frame f : page.frames()) {
      String cdpFrameId = findCdpFrameIdByUrl(frameTree, f.url());
      if (cdpFrameId != null) {
        frameIdToFrame.put(cdpFrameId, f);
      }
    }

    List<Map<String, Object>> allNodes = new ArrayList<>();
    for (String frameId : frameIds) {
      try {
        Map<String, Object> resp =
            sendCdp("Accessibility.getFullAXTree", Map.of("frameId", frameId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> nodes =
            (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
        Frame pwFrame = frameIdToFrame.getOrDefault(frameId, page.mainFrame());
        for (Map<String, Object> node : nodes) {
          node.put("_frame", pwFrame);
          if (node.get("parentId") == null && frameToIframeMap.containsKey(frameId)) {
            node.put("_parent_iframe_backend_node_id", frameToIframeMap.get(frameId));
          }
          allNodes.add(node);
        }
      } catch (RuntimeException e) {
        LOG.debug("Frame {} failed", frameId, e);
      }
    }

    Map<String, Object> cdpResponse = new LinkedHashMap<>();
    cdpResponse.put("nodes", allNodes);
    return new ChromiumAccessibilityTree(cdpResponse);
  }

  // region Actions

  @Override
  public void click(int id) {
    Locator element = findElement(id);
    String tag = (String) element.evaluate("el => el.tagName");
    if (tag != null && tag.equalsIgnoreCase("option")) {
      Object value = element.evaluate("el => el.value");
      Locator parentSelect = element.locator("xpath=parent::select");
      autoswitchToNewTabAction(() -> parentSelect.selectOption(String.valueOf(value)));
    } else {
      autoswitchToNewTabAction(() -> element.click(new Locator.ClickOptions().setForce(true)));
    }
  }

  @Override
  public void dragSlider(int id, double value) {
    findElement(id).fill(stripTrailingZeros(value));
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    findElement(fromId).dragTo(findElement(toId));
  }

  @Override
  public void hover(int id) {
    findElement(id).hover();
  }

  @Override
  public void pressKey(Key key) {
    autoswitchToNewTabAction(() -> page.keyboard().press(key.value()));
  }

  @Override
  public void quit() {
    page.close();
  }

  @Override
  public void back() {
    page.goBack();
  }

  @Override
  public void visit(String url) {
    page.navigate(url);
  }

  @Override
  public String screenshot() {
    byte[] data = page.screenshot(new Page.ScreenshotOptions().setFullPage(fullPageScreenshot));
    return Base64.getEncoder().encodeToString(data);
  }

  @Override
  public void scrollTo(int id) {
    findElement(id).scrollIntoViewIfNeeded();
  }

  @Override
  public String title() {
    return page.title();
  }

  @Override
  public void type(int id, String text) {
    findElement(id).fill(text);
  }

  @Override
  public void upload(int id, List<String> paths) {
    Locator element = findElement(id);
    com.microsoft.playwright.FileChooser fc =
        page.waitForFileChooser(
            new Page.WaitForFileChooserOptions().setTimeout(5000d),
            () -> element.click(new Locator.ClickOptions().setForce(true)));
    Path[] pathArray = paths.stream().map(Paths::get).toArray(Path[]::new);
    fc.setFiles(pathArray);
  }

  @Override
  public String url() {
    return page.url();
  }

  @Override
  public String app() {
    try {
      String host = URI.create(page.url()).getHost();
      return host == null ? "unknown" : host;
    } catch (RuntimeException e) {
      return "unknown";
    }
  }

  @Override
  public Locator findElement(int id) {
    AccessibilityElement element = accessibilityTree().elementById(id);
    Frame frame = element.frame() instanceof Frame f ? f : page.mainFrame();

    Integer backendNodeId = element.backendNodeId();
    if (backendNodeId == null) {
      throw new IllegalStateException("Element " + id + " has no backendNodeId");
    }
    sendCdp("DOM.enable", null);
    sendCdp("DOM.getFlattenedDocument", null);
    Map<String, Object> pushed =
        sendCdp(
            "DOM.pushNodesByBackendIdsToFrontend",
            Map.of("backendNodeIds", List.of(backendNodeId)));
    @SuppressWarnings("unchecked")
    List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
    if (nodeIds == null || nodeIds.isEmpty()) {
      throw new IllegalStateException("CDP did not return a node id for " + backendNodeId);
    }
    Number nodeId = nodeIds.get(0);
    sendCdp(
        "DOM.setAttributeValue",
        Map.of("nodeId", nodeId, "name", "data-alumnium-id", "value", backendNodeId.toString()));
    return frame.locator("css=[data-alumnium-id='" + backendNodeId + "']");
  }

  @Override
  public void executeScript(String script) {
    page.evaluate("() => { " + script + " }");
  }

  @Override
  public void switchToNextTab() {
    page.waitForTimeout(100);
    if (pages.size() <= 1) return;
    int idx = pages.indexOf(page);
    Page next = pages.get((idx + 1) % pages.size());
    this.page = next;
    this.client = next.context().newCDPSession(next);
    next.waitForLoadState();
  }

  @Override
  public void switchToPreviousTab() {
    page.waitForTimeout(100);
    if (pages.size() <= 1) return;
    int idx = pages.indexOf(page);
    Page prev = pages.get((idx - 1 + pages.size()) % pages.size());
    this.page = prev;
    this.client = prev.context().newCDPSession(prev);
    prev.waitForLoadState();
  }

  @Override
  public void printToPdf(String filepath) {
    page.pdf(new Page.PdfOptions().setPath(Paths.get(filepath)));
  }

  // endregion
  // region Internals

  private Map<String, Object> sendCdp(String method, Map<String, Object> params) {
    JsonObject paramsJson;
    if (params == null || params.isEmpty()) {
      paramsJson = new JsonObject();
    } else {
      try {
        String json = MAPPER.writeValueAsString(params);
        paramsJson = com.google.gson.JsonParser.parseString(json).getAsJsonObject();
      } catch (Exception e) {
        throw new IllegalStateException("Failed to encode CDP params for " + method, e);
      }
    }
    JsonObject resp = client.send(method, paramsJson);
    if (resp == null) return Map.of();
    try {
      JsonNode parsed = MAPPER.readTree(resp.toString());
      @SuppressWarnings("unchecked")
      Map<String, Object> out = MAPPER.convertValue(parsed, Map.class);
      return out == null ? Map.of() : out;
    } catch (Exception e) {
      throw new IllegalStateException("Failed to parse CDP response for " + method, e);
    }
  }

  private void enableTargetAutoAttach() {
    try {
      sendCdp(
          "Target.setAutoAttach",
          Map.of("autoAttach", true, "waitForDebuggerOnStart", false, "flatten", true));
    } catch (RuntimeException e) {
      LOG.debug("Could not enable Target.setAutoAttach", e);
    }
  }

  private void waitForPageToLoad() {
    Retry.Options opts = new Retry.Options();
    opts.maxAttempts = 2;
    opts.backOffMillis = 500L;
    opts.doRetry =
        e -> e.getMessage() != null && e.getMessage().contains(CONTEXT_WAS_DESTROYED_ERROR);
    Retry.execute(
        opts,
        () -> {
          page.evaluate(WAITER_SCRIPT);
          Object err =
              page.evaluate(
                  "(...scriptArgs) => new Promise((resolve) => "
                      + "{ const arguments = [...scriptArgs, resolve]; "
                      + WAIT_FOR_SCRIPT
                      + " })");
          if (err != null) {
            LOG.debug("Failed to wait for page: {}", err);
          }
          return null;
        });
  }

  private void setupPageTracking(Page initialPage) {
    pages.add(initialPage);
    attachPageListeners(initialPage);
  }

  private void attachPageListeners(Page page) {
    page.onPopup(this::onPopup);
    page.onClose(this::onPageClose);
  }

  private void onPopup(Page popup) {
    LOG.debug("New popup opened: {}", popup.url());
    pages.add(popup);
    attachPageListeners(popup);
  }

  private void onPageClose(Page closed) {
    if (pages.remove(closed)) {
      LOG.debug("Page closed: {}", closed.url());
    }
  }

  private void autoswitchToNewTabAction(Runnable action) {
    if (!autoswitchToNewTab) {
      action.run();
      return;
    }

    Page newPage;
    try {
      newPage =
          page.context()
              .waitForPage(
                  new BrowserContext.WaitForPageOptions()
                      .setTimeout(Config.PLAYWRIGHT_NEW_TAB_TIMEOUT),
                  action);
    } catch (TimeoutError e) {
      return;
    }

    if (newPage != null) {
      LOG.debug("Auto-switching to new tab {} ({})", newPage.url(), newPage.title());
      if (!pages.contains(newPage)) {
        pages.add(newPage);
        attachPageListeners(newPage);
      }
      this.page = newPage;
      this.client = newPage.context().newCDPSession(newPage);
    }
  }

  private static String frameIdOf(Map<String, Object> frameInfo) {
    @SuppressWarnings("unchecked")
    Map<String, Object> frame = (Map<String, Object>) frameInfo.get("frame");
    return frame == null ? "" : String.valueOf(frame.get("id"));
  }

  private static List<String> collectFrameIds(Map<String, Object> frameInfo) {
    List<String> out = new ArrayList<>();
    out.add(frameIdOf(frameInfo));
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
      Map<String, Object> frameInfo, String mainFrameId, Map<String, Integer> frameToIframeMap) {
    String id = frameIdOf(frameInfo);
    if (!id.equals(mainFrameId)) {
      try {
        sendCdp("DOM.enable", null);
        Map<String, Object> owner = sendCdp("DOM.getFrameOwner", Map.of("frameId", id));
        Object backend = owner.get("backendNodeId");
        if (backend instanceof Number n) {
          frameToIframeMap.put(id, n.intValue());
        }
      } catch (RuntimeException e) {
        LOG.debug("Could not get frame owner for {}", id, e);
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

  private static String findCdpFrameIdByUrl(Map<String, Object> frameInfo, String targetUrl) {
    @SuppressWarnings("unchecked")
    Map<String, Object> frame = (Map<String, Object>) frameInfo.get("frame");
    if (frame != null && targetUrl != null && targetUrl.equals(frame.get("url"))) {
      return String.valueOf(frame.get("id"));
    }
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> children = (List<Map<String, Object>>) frameInfo.get("childFrames");
    if (children != null) {
      for (Map<String, Object> child : children) {
        String r = findCdpFrameIdByUrl(child, targetUrl);
        if (r != null) return r;
      }
    }
    return null;
  }

  private static String stripTrailingZeros(double value) {
    if (value == (long) value) return Long.toString((long) value);
    String s = Double.toString(value);
    if (s.contains(".")) s = s.replaceAll("0+$", "").replaceAll("\\.$", "");
    return s;
  }

  // endregion
}
