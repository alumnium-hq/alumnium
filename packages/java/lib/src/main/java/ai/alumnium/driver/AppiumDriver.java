package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.driver.locators.Element;
import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.accessibility.UIAutomator2AccessibilityTree;
import ai.alumnium.accessibility.XCUITestAccessibilityTree;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;
import ai.alumnium.tool.PressKeyTool;
import ai.alumnium.tool.TypeTool;
import io.appium.java_client.AppiumBy;

import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.openqa.selenium.By;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;

/**
 * Appium (mobile) implementation of {@link BaseDriver}.
 *
 * <p>Switches between the {@code NATIVE_APP} and a web-view context when
 * gathering source vs. querying title/URL. Tools unsupported on mobile
 * (e.g. tab switching, drag slider) throw {@link UnsupportedOperationException}.
 */
public final class AppiumDriver extends BaseDriver {

    private static final Logger LOG = LoggerFactory.getLogger(AppiumDriver.class);

    public enum Platform { UIAUTOMATOR2, XCUITEST }

    private final io.appium.java_client.AppiumDriver driver;
    private final Platform platform;
    private boolean autoswitchContexts = true;
    private double delay = Config.DELAY;
    private boolean hideKeyboardAfterTyping = false;
    private boolean doubleFetchPageSource = false;
    private final Set<Class<? extends BaseTool>> supportedTools = Set.of(
        ClickTool.class,
        PressKeyTool.class,
        TypeTool.class
    );

    public AppiumDriver(io.appium.java_client.AppiumDriver driver) {
        this.driver = driver;
        Object automationName = driver.getCapabilities().getCapability("automationName");
        if (automationName != null && automationName.toString().equalsIgnoreCase("uiautomator2")) {
            this.platform = Platform.UIAUTOMATOR2;
        } else {
            this.platform = Platform.XCUITEST;
        }
    }

    @Override public String platform() {
        return platform == Platform.UIAUTOMATOR2 ? "uiautomator2" : "xcuitest";
    }

    @Override public Set<Class<? extends BaseTool>> supportedTools() { return supportedTools; }

    @Override
    public BaseAccessibilityTree accessibilityTree() {
        ensureNativeContext();
        sleep(delay);
        if (doubleFetchPageSource) {
            driver.getPageSource();
        }
        String xml = driver.getPageSource();
        return platform == Platform.UIAUTOMATOR2
            ? new UIAutomator2AccessibilityTree(xml)
            : new XCUITestAccessibilityTree(xml);
    }

    // region Actions

    @Override
    public void click(int id) {
        ensureNativeContext();
        WebElement element = findRaw(id);
        scrollIntoView(element);
        element.click();
    }

    @Override
    public void dragSlider(int id, double value) {
        throw new UnsupportedOperationException("dragSlider not supported for Appium");
    }

    @Override
    public void dragAndDrop(int fromId, int toId) {
        ensureNativeContext();
        // Appium 9.x removed the dedicated helper; the Actions/gestures API is
        // the recommended replacement. We fall back to a simple move-press-release.
        WebElement fromElement = findRaw(fromId);
        WebElement toElement = findRaw(toId);
        scrollIntoView(fromElement);
        new Actions(driver).clickAndHold(fromElement).moveToElement(toElement).release().perform();
    }

    @Override
    public void pressKey(Key key) {
        ensureNativeContext();
        CharSequence code = switch (key) {
            case BACKSPACE -> org.openqa.selenium.Keys.BACK_SPACE;
            case ENTER -> org.openqa.selenium.Keys.ENTER;
            case ESCAPE -> org.openqa.selenium.Keys.ESCAPE;
            case TAB -> org.openqa.selenium.Keys.TAB;
        };
        new Actions(driver).sendKeys(code).perform();
    }

    @Override public void quit() { driver.quit(); }
    @Override public void back() { driver.navigate().back(); }
    @Override public void visit(String url) { driver.get(url); }

    @Override
    public String screenshot() {
        return ((TakesScreenshot) driver).getScreenshotAs(OutputType.BASE64);
    }

    @Override
    public void scrollTo(int id) {
        scrollIntoView(findRaw(id));
    }

    @Override
    public String title() {
        ensureWebviewContext();
        try {
            return driver.getTitle();
        } catch (RuntimeException e) {
            return "";
        }
    }

    @Override
    public void type(int id, String text) {
        ensureNativeContext();
        WebElement element = findRaw(id);
        scrollIntoView(element);
        element.clear();
        element.sendKeys(text);
    }

    @Override
    public String url() {
        ensureWebviewContext();
        try {
            return driver.getCurrentUrl();
        } catch (RuntimeException e) {
            return "";
        }
    }

    @Override
    public String app() {
        var caps = driver.getCapabilities();
        for (String key : new String[]{"appPackage", "bundleId", "appium:appPackage", "appium:bundleId"}) {
            Object v = caps.getCapability(key);
            if (v != null && !v.toString().isEmpty()) return v.toString();
        }
        return "unknown";
    }

    @Override
    public Element findElement(int id) {
        return new Element.Appium(findRaw(id));
    }

    @Override
    public void executeScript(String script) {
        ensureWebviewContext();
        driver.executeScript(script);
    }

    @Override
    public void switchToNextTab() {
        throw new UnsupportedOperationException("Tab switching not supported for Appium");
    }

    @Override
    public void switchToPreviousTab() {
        throw new UnsupportedOperationException("Tab switching not supported for Appium");
    }

    @Override
    public void printToPdf(String filepath) {
        throw new UnsupportedOperationException("Printing to PDF not supported for Appium");
    }

    // endregion
    // region Internals

    private WebElement findRaw(int id) {
        AccessibilityElement element = accessibilityTree().elementById(id);
        return platform == Platform.XCUITEST ? findElementIos(element) : findElementAndroid(element);
    }

    private WebElement findElementIos(AccessibilityElement element) {
        StringBuilder predicate = new StringBuilder();
        predicate.append("type == \"").append(element.type()).append("\"");
        appendPredicate(predicate, "name", element.name());
        appendPredicate(predicate, "value", element.value());
        appendPredicate(predicate, "label", element.label());
        String expr = predicate.toString();
        return driver.findElement(AppiumBy.iOSNsPredicateString(expr));
    }

    private void appendPredicate(StringBuilder out, String key, String value) {
        if (value == null || value.isEmpty()) return;
        out.append(" AND ").append(key).append(" == \"").append(value).append("\"");
    }

    private WebElement findElementAndroid(AccessibilityElement element) {
        StringBuilder xpath = new StringBuilder();
        xpath.append("//").append(element.type());
        StringBuilder preds = new StringBuilder();
        appendXpathPredicate(preds, "resource-id", element.androidResourceId());
        appendXpathPredicate(preds, "bounds", element.androidBounds());
        if (preds.length() > 0) {
            xpath.append('[').append(preds).append(']');
        }
        return driver.findElement(By.xpath(xpath.toString()));
    }

    private void appendXpathPredicate(StringBuilder out, String key, String value) {
        if (value == null || value.isEmpty()) return;
        if (out.length() > 0) out.append(" and ");
        out.append('@').append(key).append("=\"").append(value).append('\"');
    }

    private void ensureNativeContext() {
        if (!autoswitchContexts) return;
        var switcher = (io.appium.java_client.remote.SupportsContextSwitching) driver;
        if (!"NATIVE_APP".equals(switcher.getContext())) {
            switcher.context("NATIVE_APP");
        }
    }

    private void ensureWebviewContext() {
        if (!autoswitchContexts) return;
        var switcher = (io.appium.java_client.remote.SupportsContextSwitching) driver;
        var contexts = new java.util.ArrayList<>(switcher.getContextHandles());
        for (int i = contexts.size() - 1; i >= 0; i--) {
            String ctx = contexts.get(i);
            if (ctx.contains("WEBVIEW")) {
                switcher.context(ctx);
                return;
            }
        }
    }

    private void scrollIntoView(WebElement element) {
        if (platform == Platform.UIAUTOMATOR2) {
            scrollIntoViewAndroid(element);
        } else {
            driver.executeScript("mobile: scrollToElement", java.util.Map.of("elementId", ((org.openqa.selenium.remote.RemoteWebElement) element).getId()));
        }
    }

    private void scrollIntoViewAndroid(WebElement element) {
        if (element.isDisplayed()) return;
        // Minimal fallback: skip swipe gesture implementation. Real impl
        // should port the Python _scroll_into_view_android loop.
        LOG.warn("Android scroll-into-view fallback is not implemented; element may be off-screen");
    }

    private static void sleep(double seconds) {
        if (seconds <= 0) return;
        try {
            Thread.sleep((long) (seconds * 1000d));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public AppiumDriver autoswitchContexts(boolean v) { this.autoswitchContexts = v; return this; }
    public AppiumDriver delay(double v) { this.delay = v; return this; }
    public AppiumDriver hideKeyboardAfterTyping(boolean v) { this.hideKeyboardAfterTyping = v; return this; }
    public AppiumDriver doubleFetchPageSource(boolean v) { this.doubleFetchPageSource = v; return this; }

    // endregion
}
