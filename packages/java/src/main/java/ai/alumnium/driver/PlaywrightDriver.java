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
import java.util.HashSet;
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
  private final Set<Frame> oopifFrames = new HashSet<>();
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
    setupPageTracking(page);
    initCDPSession();
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

    Map<String, Frame> frameIdToFrame = buildPlaywrightFrameMap(frameTreeResp);
    List<String> oopifFrameIds =
        frameIdToFrame.entrySet().stream()
            .filter(e -> oopifFrames.contains(e.getValue()))
            .map(Map.Entry::getKey)
            .toList();
    LOG.debug("Found {} same-process frames, {} OOPIFs", frameIds.size(), oopifFrameIds.size());

    Map<String, Integer> frameToIframeMap =
        buildFrameOwnerMap(frameTree, mainFrameId, oopifFrameIds);

    List<Map<String, Object>> allNodes = new ArrayList<>();
    int frameIndex = 0;

    for (String frameId : frameIds) {
      Frame pwFrame = frameIdToFrame.getOrDefault(frameId, page.mainFrame());
      List<Map<String, Object>> nodes = getFrameNodes(frameId);
      mergeFrameNodes(nodes, frameId, frameToIframeMap, pwFrame, frameIndex++, allNodes);
    }

    for (String oopifFrameId : oopifFrameIds) {
      Frame pwFrame = frameIdToFrame.get(oopifFrameId);
      List<Map<String, Object>> nodes = getOopifNodes(oopifFrameId, pwFrame);
      mergeFrameNodes(nodes, oopifFrameId, frameToIframeMap, pwFrame, frameIndex++, allNodes);
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
      Locator parentSelect = element.locator("xpath=ancestor::select");
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

    Long backendNodeId = element.backendNodeId();
    if (backendNodeId == null) {
      throw new IllegalStateException("Element " + id + " has no backendNodeId");
    }

    boolean isOopif = frame != page.mainFrame() && oopifFrames.contains(frame);
    CDPSession session = isOopif ? page.context().newCDPSession(frame) : client;
    try {
      sendCdpOn(session, "DOM.enable", null);
      sendCdpOn(session, "DOM.getFlattenedDocument", null);
      Map<String, Object> pushed =
          sendCdpOn(
              session,
              "DOM.pushNodesByBackendIdsToFrontend",
              Map.of("backendNodeIds", List.of(backendNodeId)));
      @SuppressWarnings("unchecked")
      List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
      if (nodeIds == null || nodeIds.isEmpty()) {
        throw new IllegalStateException("CDP did not return a node id for " + backendNodeId);
      }
      Number nodeId = nodeIds.get(0);
      sendCdpOn(
          session,
          "DOM.setAttributeValue",
          Map.of("nodeId", nodeId, "name", "data-alumnium-id", "value", backendNodeId.toString()));
    } finally {
      if (isOopif) session.detach();
    }

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
    this.page = pages.get((idx + 1) % pages.size());
    initCDPSession();
    page.waitForLoadState();
  }

  @Override
  public void switchToPreviousTab() {
    page.waitForTimeout(100);
    if (pages.size() <= 1) return;
    int idx = pages.indexOf(page);
    this.page = pages.get((idx - 1 + pages.size()) % pages.size());
    initCDPSession();
    page.waitForLoadState();
  }

  @Override
  public void printToPdf(String filepath) {
    page.pdf(new Page.PdfOptions().setPath(Paths.get(filepath)));
  }

  // endregion
  // region Internals

  private void initCDPSession() {
    oopifFrames.clear();
    this.client = page.context().newCDPSession(page);
    enableTargetAutoAttach();
  }

  private void mergeFrameNodes(
      List<Map<String, Object>> nodes,
      String frameId,
      Map<String, Integer> frameToIframeMap,
      Frame pwFrame,
      int frameIndex,
      List<Map<String, Object>> allNodes) {
    String prefix = "f" + frameIndex + ":";
    for (Map<String, Object> node : nodes) {
      Object nid = node.get("nodeId");
      if (nid != null) node.put("nodeId", prefix + nid);
      Object pid = node.get("parentId");
      if (pid != null) node.put("parentId", prefix + pid);
      @SuppressWarnings("unchecked")
      List<Object> childIds = (List<Object>) node.get("childIds");
      if (childIds != null) {
        List<Object> prefixed = new ArrayList<>(childIds.size());
        for (Object cid : childIds) prefixed.add(prefix + cid);
        node.put("childIds", prefixed);
      }
      node.put("_frame", pwFrame);
      if (node.get("parentId") == null && frameToIframeMap.containsKey(frameId)) {
        node.put("_parent_iframe_backend_node_id", frameToIframeMap.get(frameId));
      }
      allNodes.add(node);
    }
  }

  private List<Map<String, Object>> getOopifNodes(String frameId, Frame pwFrame) {
    try {
      CDPSession frameSession = page.context().newCDPSession(pwFrame);
      Map<String, Object> resp = sendCdpOn(frameSession, "Accessibility.getFullAXTree", null);
      frameSession.detach();
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> nodes =
          (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
      LOG.debug("  -> OOPIF {}: {} nodes", frameId, nodes.size());
      return nodes;
    } catch (RuntimeException e) {
      LOG.debug("  -> OOPIF {}: failed", frameId, e);
      return List.of();
    }
  }

  private Map<String, Object> sendCdp(String method, Map<String, Object> params) {
    return sendCdpOn(client, method, params);
  }

  private Map<String, Object> sendCdpOn(
      CDPSession session, String method, Map<String, Object> params) {
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
    JsonObject resp = session.send(method, paramsJson);
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
      initCDPSession();
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

  private Map<String, Frame> buildPlaywrightFrameMap(Map<String, Object> frameTreeResp) {
    @SuppressWarnings("unchecked")
    Map<String, Object> frameTree = (Map<String, Object>) frameTreeResp.get("frameTree");
    Map<String, Frame> map = new HashMap<>();
    for (Frame f : page.frames()) {
      String cdpFrameId = findCdpFrameIdByUrl(frameTree, f.url());
      if (cdpFrameId != null) map.put(cdpFrameId, f);
    }

    oopifFrames.clear();
    for (Frame pwFrame : page.frames()) {
      if (pwFrame == page.mainFrame()) continue;
      if (map.containsValue(pwFrame)) continue;
      try {
        CDPSession frameSession = page.context().newCDPSession(pwFrame);
        Map<String, Object> ft = sendCdpOn(frameSession, "Page.getFrameTree", null);
        frameSession.detach();
        @SuppressWarnings("unchecked")
        Map<String, Object> ftTree = (Map<String, Object>) ft.get("frameTree");
        String rootFrameId = frameIdOf(ftTree);
        map.put(rootFrameId, pwFrame);
        oopifFrames.add(pwFrame);
        LOG.debug("Mapped OOPIF {}... to Playwright frame", rootFrameId);
      } catch (RuntimeException e) {
        LOG.debug("Could not detect OOPIF frame", e);
      }
    }
    return map;
  }

  private Map<String, Integer> buildFrameOwnerMap(
      Map<String, Object> frameInfo, String mainFrameId, List<String> oopifFrameIds) {
    Map<String, Integer> map = new HashMap<>();
    sendCdp("DOM.enable", null);
    walkFrameOwners(frameInfo, mainFrameId, map);
    for (String oopifFrameId : oopifFrameIds) {
      try {
        Map<String, Object> owner = sendCdp("DOM.getFrameOwner", Map.of("frameId", oopifFrameId));
        Object backend = owner.get("backendNodeId");
        if (backend instanceof Number n) {
          map.put(oopifFrameId, n.intValue());
          LOG.debug("OOPIF {}... owned by iframe backendNodeId={}", oopifFrameId, n.intValue());
        }
      } catch (RuntimeException e) {
        LOG.debug("Could not get frame owner for OOPIF {}", oopifFrameId, e);
      }
    }
    return map;
  }

  private void walkFrameOwners(
      Map<String, Object> frameInfo, String mainFrameId, Map<String, Integer> map) {
    String id = frameIdOf(frameInfo);
    if (!id.equals(mainFrameId)) {
      try {
        Map<String, Object> owner = sendCdp("DOM.getFrameOwner", Map.of("frameId", id));
        Object backend = owner.get("backendNodeId");
        if (backend instanceof Number n) {
          map.put(id, n.intValue());
          LOG.debug("Frame {}... owned by iframe backendNodeId={}", id, n.intValue());
        }
      } catch (RuntimeException e) {
        LOG.debug("Could not get frame owner for {}", id, e);
      }
    }
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> children = (List<Map<String, Object>>) frameInfo.get("childFrames");
    if (children != null) {
      for (Map<String, Object> child : children) walkFrameOwners(child, mainFrameId, map);
    }
  }

  private List<Map<String, Object>> getFrameNodes(String frameId) {
    try {
      Map<String, Object> resp = sendCdp("Accessibility.getFullAXTree", Map.of("frameId", frameId));
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> nodes =
          (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
      LOG.debug("  -> Frame {}: {} nodes", frameId, nodes.size());
      return nodes;
    } catch (RuntimeException e) {
      LOG.debug("  -> Frame {}: failed", frameId, e);
      return List.of();
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
