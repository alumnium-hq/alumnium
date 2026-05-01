package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.driver.locators.Element;
import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.JsonObject;
import com.microsoft.playwright.CDPSession;
import com.microsoft.playwright.Frame;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.LoadState;

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

/**
 * Playwright implementation of {@link BaseDriver}.
 */
public final class PlaywrightDriver extends BaseDriver {

    private static final Logger LOG = LoggerFactory.getLogger(PlaywrightDriver.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String WAITER_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waiter.js");
    private static final String WAIT_FOR_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waitFor.js");

    private Page page;
    private CDPSession client;
    private boolean autoswitchToNewTab = true;
    private boolean fullPageScreenshot = Config.FULL_PAGE_SCREENSHOT;
    private final Set<Class<? extends BaseTool>> supportedTools = Set.of(
        ClickTool.class
    );

    public PlaywrightDriver(Page page) {
        this.page = page;
        this.client = page.context().newCDPSession(page);
        enableTargetAutoAttach();
    }

    @Override public String platform() { return "chromium"; }
    @Override public Set<Class<? extends BaseTool>> supportedTools() { return supportedTools; }

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
        Map<String, String> frameParentMap = new HashMap<>();
        buildFrameHierarchy(frameTree, mainFrameId, frameToIframeMap, frameParentMap, null);

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
                Map<String, Object> resp = sendCdp("Accessibility.getFullAXTree",
                    Map.of("frameId", frameId));
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes =
                    (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
                List<Integer> chain = frameChain(frameId, frameToIframeMap, frameParentMap);
                Frame pwFrame = frameIdToFrame.getOrDefault(frameId, page.mainFrame());
                for (Map<String, Object> node : nodes) {
                    if (!chain.isEmpty()) {
                        node.put("_frame_chain", chain);
                    }
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
        Locator element = findRaw(id);
        String tag = (String) element.evaluate("el => el.tagName");
        if (tag != null && tag.equalsIgnoreCase("option")) {
            Object value = element.evaluate("el => el.value");
            Locator parentSelect = element.locator("xpath=parent::select");
            parentSelect.selectOption(String.valueOf(value));
        } else {
            element.click(new Locator.ClickOptions().setForce(true));
        }
    }

    @Override
    public void dragSlider(int id, double value) {
        findRaw(id).fill(stripTrailingZeros(value));
    }

    @Override
    public void dragAndDrop(int fromId, int toId) {
        findRaw(fromId).dragTo(findRaw(toId));
    }

    @Override
    public void hover(int id) {
        findRaw(id).hover();
    }

    @Override
    public void pressKey(Key key) {
        page.keyboard().press(key.value());
    }

    @Override public void quit() { page.close(); }
    @Override public void back() { page.goBack(); }
    @Override public void visit(String url) { page.navigate(url); }

    @Override
    public String screenshot() {
        byte[] data = page.screenshot(new Page.ScreenshotOptions().setFullPage(fullPageScreenshot));
        return Base64.getEncoder().encodeToString(data);
    }

    @Override
    public void scrollTo(int id) {
        findRaw(id).scrollIntoViewIfNeeded();
    }

    @Override public String title() { return page.title(); }

    @Override
    public void type(int id, String text) {
        findRaw(id).fill(text);
    }

    @Override
    public void upload(int id, List<String> paths) {
        Locator element = findRaw(id);
        com.microsoft.playwright.FileChooser fc = page.waitForFileChooser(
            new Page.WaitForFileChooserOptions().setTimeout(5000d),
            () -> element.click(new Locator.ClickOptions().setForce(true)));
        Path[] pathArray = paths.stream().map(Paths::get).toArray(Path[]::new);
        fc.setFiles(pathArray);
    }

    @Override public String url() { return page.url(); }

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
    public Element findElement(int id) {
        return new Element.Playwright(findRaw(id));
    }

    @Override
    public void executeScript(String script) {
        page.evaluate("() => { " + script + " }");
    }

    @Override
    public void switchToNextTab() {
        List<Page> pages = page.context().pages();
        if (pages.size() <= 1) return;
        int idx = pages.indexOf(page);
        Page next = pages.get((idx + 1) % pages.size());
        this.page = next;
        this.client = next.context().newCDPSession(next);
        next.waitForLoadState(LoadState.LOAD);
    }

    @Override
    public void switchToPreviousTab() {
        List<Page> pages = page.context().pages();
        if (pages.size() <= 1) return;
        int idx = pages.indexOf(page);
        Page prev = pages.get((idx - 1 + pages.size()) % pages.size());
        this.page = prev;
        this.client = prev.context().newCDPSession(prev);
        prev.waitForLoadState(LoadState.LOAD);
    }

    @Override
    public void printToPdf(String filepath) {
        page.pdf(new Page.PdfOptions().setPath(Paths.get(filepath)));
    }

    // endregion
    // region Internals

    private Locator findRaw(int id) {
        AccessibilityElement element = accessibilityTree().elementById(id);
        Frame frame = element.frame() instanceof Frame f ? f : page.mainFrame();

        if (element.locatorInfo() != null) {
            return findByLocator(frame, element.locatorInfo());
        }
        Integer backendNodeId = element.backendNodeId();
        if (backendNodeId == null) {
            throw new IllegalStateException("Element " + id + " missing backendNodeId and locator info");
        }
        sendCdp("DOM.enable", null);
        sendCdp("DOM.getFlattenedDocument", null);
        Map<String, Object> pushed = sendCdp("DOM.pushNodesByBackendIdsToFrontend",
            Map.of("backendNodeIds", List.of(backendNodeId)));
        @SuppressWarnings("unchecked")
        List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
        if (nodeIds == null || nodeIds.isEmpty()) {
            throw new IllegalStateException("CDP did not return a node id for " + backendNodeId);
        }
        Number nodeId = nodeIds.get(0);
        sendCdp("DOM.setAttributeValue",
            Map.of("nodeId", nodeId, "name", "data-alumnium-id", "value", backendNodeId.toString()));
        return frame.locator("css=[data-alumnium-id='" + backendNodeId + "']");
    }

    private Locator findByLocator(Frame frame, Map<String, Object> locatorInfo) {
        if (Boolean.TRUE.equals(locatorInfo.get("_synthetic_frame"))) {
            return frame.locator("body");
        }
        if (locatorInfo.containsKey("selector") && locatorInfo.containsKey("nth")) {
            String selector = String.valueOf(locatorInfo.get("selector"));
            int nth = ((Number) locatorInfo.get("nth")).intValue();
            return frame.locator(selector).nth(nth);
        }
        Object role = locatorInfo.get("role");
        Object name = locatorInfo.get("name");
        if (role != null && name != null) {
            return frame.getByRole(parseRole(role.toString()),
                new Frame.GetByRoleOptions().setName(name.toString()));
        }
        if (role != null) {
            return frame.getByRole(parseRole(role.toString()));
        }
        if (name != null) {
            return frame.getByText(name.toString());
        }
        throw new IllegalArgumentException("Cannot build locator from info: " + locatorInfo);
    }

    private static AriaRole parseRole(String role) {
        try {
            return AriaRole.valueOf(role.toUpperCase().replace('-', '_'));
        } catch (IllegalArgumentException e) {
            return AriaRole.GENERIC;
        }
    }

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
            sendCdp("Target.setAutoAttach",
                Map.of("autoAttach", true, "waitForDebuggerOnStart", false, "flatten", true));
        } catch (RuntimeException e) {
            LOG.debug("Could not enable Target.setAutoAttach", e);
        }
    }

    private void waitForPageToLoad() {
        try {
            page.evaluate(WAITER_SCRIPT);
            Object err = page.evaluate(
                "(...scriptArgs) => new Promise((resolve) => "
                    + "{ const arguments = [...scriptArgs, resolve]; " + WAIT_FOR_SCRIPT + " })");
            if (err != null) {
                LOG.debug("Failed to wait for page: {}", err);
            }
        } catch (RuntimeException e) {
            LOG.debug("waitForPageToLoad threw", e);
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

    private void buildFrameHierarchy(Map<String, Object> frameInfo,
                                     String mainFrameId,
                                     Map<String, Integer> frameToIframeMap,
                                     Map<String, String> frameParentMap,
                                     String parentFrameId) {
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

    private static List<Integer> frameChain(String frameId,
                                            Map<String, Integer> frameToIframeMap,
                                            Map<String, String> frameParentMap) {
        List<Integer> chain = new ArrayList<>();
        String current = frameId;
        while (frameToIframeMap.containsKey(current)) {
            chain.add(0, frameToIframeMap.get(current));
            current = frameParentMap.getOrDefault(current, null);
            if (current == null) break;
        }
        return chain;
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
