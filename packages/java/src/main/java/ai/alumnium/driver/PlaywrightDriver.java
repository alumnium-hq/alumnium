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
import com.google.gson.JsonElement;
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

  private static final int NEW_TAB_DELAY = 50;
  private static final int NEW_TAB_TIMEOUT = 10_000;

  private Page page;
  private CDPSession client;
  private final List<Page> openedPages = new ArrayList<>();
  private final Set<BrowserContext> watchedContexts = new HashSet<>();
  private Page previousPage;
  private boolean pendingWindowOpen = false;
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
    watchContextOf(page);
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
  protected ChromiumAccessibilityTree fetchAccessibilityTree() {
    switchToNewTab();
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
      autoswitchToNewTabAction(
          () -> {
            scrollElementIntoCenter(element);
            element.click(new Locator.ClickOptions().setForce(true));
          });
    }
  }

  @Override
  public void dragSlider(int id, double value) {
    Locator element = findElement(id);
    scrollElementIntoCenter(element);
    element.fill(stripTrailingZeros(value));
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    Locator fromElement = findElement(fromId);
    Locator toElement = findElement(toId);
    scrollElementIntoCenter(fromElement);
    fromElement.dragTo(toElement);
  }

  @Override
  public void hover(int id) {
    Locator element = findElement(id);
    scrollElementIntoCenter(element);
    element.hover();
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
    scrollElementIntoCenter(findElement(id));
  }

  @Override
  public String title() {
    return page.title();
  }

  @Override
  public void type(int id, String text) {
    Locator element = findElement(id);
    scrollElementIntoCenter(element);
    element.fill(text);
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
    CDPSession session = isOopif ? page.context().newCDPSession(frame) : session();
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
    page.evaluate(script);
  }

  @Override
  public void switchToNextTab() {
    List<Page> tabs = openTabs();
    if (tabs.size() <= 1) return; // Only one tab, nothing to switch
    int idx = tabs.indexOf(page);
    activatePage(tabs.get((idx + 1) % tabs.size()));
    page.waitForLoadState();
  }

  @Override
  public void switchToPreviousTab() {
    List<Page> tabs = openTabs();
    if (tabs.size() <= 1) return; // Only one tab, nothing to switch
    int idx = tabs.indexOf(page);
    activatePage(tabs.get((idx - 1 + tabs.size()) % tabs.size()));
    page.waitForLoadState();
  }

  @Override
  public void printToPdf(String filepath) {
    page.pdf(new Page.PdfOptions().setPath(Paths.get(filepath)));
  }

  // endregion
  // region Internals

  private void scrollElementIntoCenter(Locator element) {
    element.evaluate("el => el.scrollIntoView({block: 'center'})");
  }

  private void initCDPSession() {
    oopifFrames.clear();

    if (client != null) {
      try {
        client.detach();
      } catch (RuntimeException e) {
        // The target may already be closed.
      }
    }

    this.client = page.context().newCDPSession(page);
    enablePageEvents();
    enableTargetAutoAttach();
  }

  private void enablePageEvents() {
    try {
      client.send("Page.enable");

      // Playwright page event fires after navigation, so it can be very slow.
      // Use CDP instead which fires when the browser is asked to open a window.
      client.on(
          "Page.windowOpen",
          event -> {
            JsonElement url = event.get("url");
            String opened = url == null || url.isJsonNull() ? "" : url.getAsString();
            LOG.debug("Window open requested: {}", opened.isEmpty() ? "(empty)" : opened);
            pendingWindowOpen = true;
          });

      LOG.debug("Enabled Page events for new tab detection");
    } catch (RuntimeException e) {
      LOG.debug("Could not enable Page events: {}", e.getMessage());
    }
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
    return sendCdpOn(session(), method, params);
  }

  private CDPSession session() {
    if (client == null) initCDPSession();
    return client;
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

  private void flushEvents() {
    page.context().cookies();
  }

  private void watchContextOf(Page page) {
    BrowserContext context = page.context();
    if (!watchedContexts.add(context)) return;

    context.onPage(this::onPageOpened);
    LOG.debug("Watching browser context for new tabs");
  }

  private void onPageOpened(Page opened) {
    LOG.debug("New tab opened: {}", opened.url());
    pendingWindowOpen = false;
    openedPages.add(opened);
    watchContextOf(opened);
    opened.onClose(this::onPageClosed);
  }

  private void onPageClosed(Page closed) {
    openedPages.remove(closed);
    if (closed != page) return;

    if (previousPage == null || previousPage.isClosed()) {
      LOG.warn("Active tab was closed and the tab it came from is gone");
      return;
    }

    LOG.debug("Active tab was closed, returning to {}", previousPage.url());
    this.page = previousPage;
    this.previousPage = null;
    resetAccessibilityTree();
    // Opening a session here would run inside whatever call delivered this
    // event, on a tab that may be gone as well. Let the next command open one.
    this.client = null;
  }

  private void autoswitchToNewTabAction(Runnable action) {
    if (!autoswitchToNewTab) {
      action.run();
      return;
    }

    // Page.windowOpen is watched on the CDP session, so it has to be live
    // before the action runs. The session is dropped when a tab closes.
    session();

    action.run();
    page.waitForTimeout(NEW_TAB_DELAY);

    if (openedPages.isEmpty() && pendingWindowOpen) {
      waitForAnnouncedTab();
    }
    switchToNewTab();
  }

  private void waitForAnnouncedTab() {
    pendingWindowOpen = false;
    LOG.debug("A tab is opening, waiting for the browser to report it");
    try {
      page.context()
          .waitForPage(
              new BrowserContext.WaitForPageOptions().setTimeout(NEW_TAB_TIMEOUT), () -> {});
    } catch (TimeoutError e) {
      LOG.debug("  <- No tab was reported, continuing");
    }
  }

  private void switchToNewTab() {
    if (!autoswitchToNewTab) {
      openedPages.clear();
      return;
    }

    flushEvents();

    Page opened = null;
    for (Page candidate : openedPages) {
      if (!candidate.isClosed()) opened = candidate;
    }

    openedPages.clear();
    if (opened == null) return;

    LOG.debug("Auto-switching to new tab: {}", opened.url());
    opened.waitForLoadState();
    activatePage(opened);
  }

  private void activatePage(Page target) {
    if (target != page) this.previousPage = page;
    this.page = target;
    watchContextOf(target);
    resetAccessibilityTree();
    initCDPSession();
  }

  private List<Page> openTabs() {
    openedPages.clear();
    flushEvents();

    List<Page> tabs = new ArrayList<>();
    for (Page tab : page.context().pages()) {
      if (!tab.isClosed()) tabs.add(tab);
    }
    return tabs;
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
