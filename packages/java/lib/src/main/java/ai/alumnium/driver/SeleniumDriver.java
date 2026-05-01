package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.accessibility.ChromiumAccessibilityTree;
import ai.alumnium.driver.locators.Element;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chromium.HasCdp;
import org.openqa.selenium.interactions.Actions;

/**
 * Selenium implementation of {@link BaseDriver}.
 */
public final class SeleniumDriver extends BaseDriver {

    private static final Logger LOG = LoggerFactory.getLogger(SeleniumDriver.class);

    private static final String WAITER_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waiter.js");
    private static final String WAIT_FOR_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waitFor.js");

    private final WebDriver driver;
    private final HasCdp cdp;
    private boolean autoswitchToNewTab = true;
    private boolean fullPageScreenshot = Config.FULL_PAGE_SCREENSHOT;
    private final Set<Class<? extends BaseTool>> supportedTools = Set.of(
        ClickTool.class
    );

    public SeleniumDriver(WebDriver driver) {
        this.driver = driver;
        if (!(driver instanceof HasCdp hasCdp)) {
            throw new IllegalArgumentException(
                "SeleniumDriver requires a Chromium-family driver that implements HasCdp");
        }
        this.cdp = hasCdp;
        enableTargetAutoAttach();
    }

    public SeleniumDriver autoswitchToNewTab(boolean value) {
        this.autoswitchToNewTab = value;
        return this;
    }

    public SeleniumDriver fullPageScreenshot(boolean value) {
        this.fullPageScreenshot = value;
        return this;
    }

    @Override public String platform() { return "chromium"; }

    @Override public Set<Class<? extends BaseTool>> supportedTools() { return supportedTools; }

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
                Map<String, Object> resp = executeCdp("Accessibility.getFullAXTree", Map.of("frameId", frameId));
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes = (List<Map<String, Object>>) resp.getOrDefault("nodes", List.of());
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

        Map<String, Object> cdpResponse = new LinkedHashMap<>();
        cdpResponse.put("nodes", allNodes);
        return new ChromiumAccessibilityTree(cdpResponse);
    }

    // region Actions

    @Override
    public void click(int id) {
        withTabAutoswitch(() -> {
            WebElement element = findRaw(id);
            try {
                new Actions(driver).moveToElement(element).click().perform();
            } catch (RuntimeException e) {
                element.click();
            }
        });
    }

    @Override
    public void dragSlider(int id, double value) {
        WebElement element = findRaw(id);
        ((JavascriptExecutor) driver).executeScript(
            "arguments[0].value = arguments[1];"
                + "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));"
                + "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
            element, Double.toString(value));
    }

    @Override
    public void dragAndDrop(int fromId, int toId) {
        new Actions(driver).dragAndDrop(findRaw(fromId), findRaw(toId)).perform();
    }

    @Override
    public void hover(int id) {
        new Actions(driver).moveToElement(findRaw(id)).perform();
    }

    @Override
    public void pressKey(Key key) {
        withTabAutoswitch(() -> {
            CharSequence keyStroke = switch (key) {
                case BACKSPACE -> org.openqa.selenium.Keys.BACK_SPACE;
                case ENTER -> org.openqa.selenium.Keys.ENTER;
                case ESCAPE -> org.openqa.selenium.Keys.ESCAPE;
                case TAB -> org.openqa.selenium.Keys.TAB;
            };
            new Actions(driver).sendKeys(keyStroke).perform();
        });
    }

    @Override public void quit() { driver.quit(); }
    @Override public void back() { driver.navigate().back(); }
    @Override public void visit(String url) { driver.get(url); }

    @Override
    public String screenshot() {
        if (fullPageScreenshot) {
            Map<String, Object> data = executeCdp("Page.captureScreenshot",
                Map.of("format", "png", "captureBeyondViewport", true));
            return String.valueOf(data.getOrDefault("data", ""));
        }
        return ((org.openqa.selenium.TakesScreenshot) driver)
            .getScreenshotAs(org.openqa.selenium.OutputType.BASE64);
    }

    @Override
    public void scrollTo(int id) {
        ((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView();", findRaw(id));
    }

    @Override public String title() { return driver.getTitle(); }

    @Override
    public void type(int id, String text) {
        WebElement element = findRaw(id);
        element.clear();
        element.sendKeys(text);
    }

    @Override
    public void upload(int id, List<String> paths) {
        WebElement element = findRaw(id);
        element.sendKeys(String.join("\n", paths));
    }

    @Override public String url() { return driver.getCurrentUrl(); }

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
    public Element findElement(int id) {
        return new Element.Selenium(findRaw(id));
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

    private WebElement findRaw(int id) {
        var element = accessibilityTree().elementById(id);
        if (element.locatorInfo() != null) {
            return findByLocator(element);
        }
        Integer backendNodeId = element.backendNodeId();
        if (backendNodeId == null) {
            throw new IllegalStateException("Element " + id + " missing backendNodeId and locator info");
        }
        List<Integer> chain = element.frameChain();
        if (chain != null && !chain.isEmpty()) {
            switchToFrameChain(chain);
        }
        executeCdp("DOM.enable", Map.of());
        executeCdp("DOM.getFlattenedDocument", Map.of());
        Map<String, Object> pushed = executeCdp("DOM.pushNodesByBackendIdsToFrontend",
            Map.of("backendNodeIds", List.of(backendNodeId)));
        @SuppressWarnings("unchecked")
        List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
        if (nodeIds == null || nodeIds.isEmpty()) {
            throw new IllegalStateException("CDP did not return a node id for " + backendNodeId);
        }
        Number nodeId = nodeIds.get(0);
        executeCdp("DOM.setAttributeValue",
            Map.of("nodeId", nodeId, "name", "data-alumnium-id", "value", backendNodeId.toString()));
        WebElement webElement = driver.findElement(By.cssSelector("[data-alumnium-id='" + backendNodeId + "']"));
        executeCdp("DOM.removeAttribute", Map.of("nodeId", nodeId, "name", "data-alumnium-id"));
        return webElement;
    }

    private WebElement findByLocator(ai.alumnium.accessibility.AccessibilityElement element) {
        Map<String, Object> locator = element.locatorInfo();
        List<Integer> chain = element.frameChain();
        if (chain != null && !chain.isEmpty()) {
            switchToFrameChain(chain);
        }
        String selector = String.valueOf(locator.getOrDefault("selector", ""));
        int nth = ((Number) locator.getOrDefault("nth", 0)).intValue();
        List<WebElement> matches = driver.findElements(By.cssSelector(selector));
        if (nth < matches.size()) {
            return matches.get(nth);
        }
        throw new IllegalStateException("No element for selector " + selector + " nth=" + nth);
    }

    private void switchToFrameChain(List<Integer> chain) {
        driver.switchTo().defaultContent();
        for (Integer iframeBackendId : chain) {
            executeCdp("DOM.enable", Map.of());
            executeCdp("DOM.getFlattenedDocument", Map.of());
            Map<String, Object> pushed = executeCdp("DOM.pushNodesByBackendIdsToFrontend",
                Map.of("backendNodeIds", List.of(iframeBackendId)));
            @SuppressWarnings("unchecked")
            List<Number> nodeIds = (List<Number>) pushed.get("nodeIds");
            if (nodeIds == null || nodeIds.isEmpty()) continue;
            Number nodeId = nodeIds.get(0);
            executeCdp("DOM.setAttributeValue",
                Map.of("nodeId", nodeId, "name", "data-alumnium-iframe-id", "value", iframeBackendId.toString()));
            WebElement iframe = driver.findElement(
                By.cssSelector("[data-alumnium-iframe-id='" + iframeBackendId + "']"));
            executeCdp("DOM.removeAttribute",
                Map.of("nodeId", nodeId, "name", "data-alumnium-iframe-id"));
            driver.switchTo().frame(iframe);
        }
    }

    private Map<String, Object> executeCdp(String command, Map<String, Object> args) {
        Map<String, Object> result = cdp.executeCdpCommand(command, args);
        return result == null ? Map.of() : result;
    }

    private void enableTargetAutoAttach() {
        try {
            executeCdp("Target.setAutoAttach",
                Map.of("autoAttach", true, "waitForDebuggerOnStart", false, "flatten", true));
        } catch (RuntimeException e) {
            LOG.debug("Could not enable Target.setAutoAttach", e);
        }
    }

    private void waitForPageToLoad() {
        try {
            ((JavascriptExecutor) driver).executeScript(WAITER_SCRIPT);
            Object err = ((JavascriptExecutor) driver).executeAsyncScript(WAIT_FOR_SCRIPT);
            if (err != null) {
                LOG.debug("Failed to wait for page: {}", err);
            }
        } catch (RuntimeException e) {
            LOG.debug("waitForPageToLoad threw", e);
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

    private void buildFrameHierarchy(Map<String, Object> frameInfo,
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

    // endregion
}
