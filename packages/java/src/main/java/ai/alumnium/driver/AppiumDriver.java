package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.accessibility.UIAutomator2AccessibilityTree;
import ai.alumnium.accessibility.XCUITestAccessibilityTree;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;
import ai.alumnium.tool.DragAndDropTool;
import ai.alumnium.tool.PressKeyTool;
import ai.alumnium.tool.TypeTool;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.remote.SupportsContextSwitching;
import java.time.Duration;
import java.util.Collections;
import java.util.Set;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.interactions.Pause;
import org.openqa.selenium.interactions.PointerInput;
import org.openqa.selenium.interactions.PointerInput.Origin;
import org.openqa.selenium.interactions.Sequence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Appium (mobile) implementation of {@link BaseDriver}.
 *
 * <p>Switches between the {@code NATIVE_APP} and a web-view context when gathering source vs.
 * querying title/URL. Tools unsupported on mobile (e.g. tab switching, drag slider) throw {@link
 * UnsupportedOperationException}.
 */
public final class AppiumDriver extends BaseDriver {

  private static final Logger LOG = LoggerFactory.getLogger(AppiumDriver.class);

  private static final String WAITER_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waiter.js");
  private static final String WAIT_FOR_SCRIPT =
      loadScript("/ai/alumnium/driver/scripts/waitFor.js");

  public enum Platform {
    UIAUTOMATOR2,
    XCUITEST
  }

  private final io.appium.java_client.AppiumDriver driver;
  private final Platform platform;
  public boolean autoswitchContexts = true;
  public double delay = Config.DELAY;
  public boolean hideKeyboardAfterTyping = false;
  public boolean doubleFetchPageSource = false;
  // Cached positive detection of a web context (WEBVIEW_*/CHROMIUM). Null until first checked.
  private Boolean sessionHasWebContext = null;
  public final Set<Class<? extends BaseTool>> supportedTools =
      Set.of(ClickTool.class, DragAndDropTool.class, PressKeyTool.class, TypeTool.class);

  public AppiumDriver(io.appium.java_client.AppiumDriver driver) {
    this.driver = driver;
    Object automationName = driver.getCapabilities().getCapability("automationName");
    if (automationName != null && automationName.toString().equalsIgnoreCase("uiautomator2")) {
      this.platform = Platform.UIAUTOMATOR2;
    } else {
      this.platform = Platform.XCUITEST;
    }
  }

  @Override
  public String platform() {
    return platform == Platform.UIAUTOMATOR2 ? "uiautomator2" : "xcuitest";
  }

  @Override
  public Set<Class<? extends BaseTool>> supportedTools() {
    return supportedTools;
  }

  @Override
  public BaseAccessibilityTree accessibilityTree() {
    waitForWebPageToLoad();
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
    WebElement element = findElement(id);
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
    WebElement fromElement = findElement(fromId);
    WebElement toElement = findElement(toId);
    scrollIntoView(fromElement);
    touchDragAndDrop(fromElement, toElement);
  }

  @Override
  public void pressKey(Key key) {
    ensureNativeContext();
    CharSequence code =
        switch (key) {
          case BACKSPACE -> org.openqa.selenium.Keys.BACK_SPACE;
          case ENTER -> org.openqa.selenium.Keys.ENTER;
          case ESCAPE -> org.openqa.selenium.Keys.ESCAPE;
          case TAB -> org.openqa.selenium.Keys.TAB;
        };
    new Actions(driver).sendKeys(code).perform();
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
    return ((TakesScreenshot) driver).getScreenshotAs(OutputType.BASE64);
  }

  @Override
  public void scrollTo(int id) {
    scrollIntoView(findElement(id));
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
    WebElement element = findElement(id);
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
    for (String key :
        new String[] {"appPackage", "bundleId", "appium:appPackage", "appium:bundleId"}) {
      Object v = caps.getCapability(key);
      if (v != null && !v.toString().isEmpty()) return v.toString();
    }
    return "unknown";
  }

  @Override
  public WebElement findElement(int id) {
    AccessibilityElement element = accessibilityTree().elementById(id);
    return platform == Platform.XCUITEST ? findElementIos(element) : findElementAndroid(element);
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
    var switcher = (SupportsContextSwitching) driver;
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
      if (isWebContext(ctx)) {
        switcher.context(ctx);
        return;
      }
    }
  }

  // Hybrid apps expose web contexts as WEBVIEW_<package>; Chrome browser sessions expose a single
  // context named CHROMIUM. Anything other than the native context is a web view we can drive.
  private static boolean isWebContext(String context) {
    return context != null && !"NATIVE_APP".equals(context);
  }

  /**
   * For browser / hybrid sessions, switch to the web context and block until the page has
   * stabilized (load complete, network idle, DOM settled) using the shared waiter script, before
   * the native accessibility tree is captured. Native-only sessions are skipped, and timeouts fall
   * through gracefully so a tree is always returned.
   */
  private void waitForWebPageToLoad() {
    if (!autoswitchContexts || !hasWebContext()) return;
    ensureWebviewContext();
    try {
      runWaiter();
    } catch (RuntimeException first) {
      // Retry once, mirroring the Selenium/Playwright drivers.
      try {
        runWaiter();
      } catch (RuntimeException retry) {
        LOG.debug("Failed to wait for web page to stabilize after retry", retry);
      }
    }
  }

  private void runWaiter() {
    JavascriptExecutor js = (JavascriptExecutor) driver;
    js.executeScript(WAITER_SCRIPT);
    Object error = js.executeAsyncScript(WAIT_FOR_SCRIPT);
    if (error != null) {
      LOG.debug("Web page did not stabilize: {}", error);
    }
  }

  private boolean hasWebContext() {
    // Cache positive detection only: a web context can appear after the first capture (hybrid
    // apps), but never disappears once present.
    if (sessionHasWebContext == null || !sessionHasWebContext) {
      var switcher = (SupportsContextSwitching) driver;
      sessionHasWebContext =
          switcher.getContextHandles().stream().anyMatch(AppiumDriver::isWebContext);
    }
    return sessionHasWebContext;
  }

  private void scrollIntoView(WebElement element) {
    if (platform == Platform.UIAUTOMATOR2) {
      scrollIntoViewAndroid(element);
    } else {
      driver.executeScript(
          "mobile: scrollToElement",
          java.util.Map.of(
              "elementId", ((org.openqa.selenium.remote.RemoteWebElement) element).getId()));
    }
  }

  private void scrollIntoViewAndroid(WebElement element) {
    if (element.isDisplayed()) return;
    // Minimal fallback: skip swipe gesture implementation. Real impl
    // should port the Python _scroll_into_view_android loop.
    LOG.warn("Android scroll-into-view fallback is not implemented; element may be off-screen");
  }

  /**
   * Slow viewport-coordinate touch drag for HTML5 drag-and-drop in mobile browsers. Fast
   * element-relative {@link Actions} gestures do not fire drag events.
   */
  private void touchDragAndDrop(WebElement fromElement, WebElement toElement) {
    PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "main_pointer");
    Sequence sequence = new Sequence(finger, 0);
    sequence.addAction(
        finger.createPointerMove(Duration.ofMillis(2000), Origin.fromElement(fromElement), 0, 0));
    sequence.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
    sequence.addAction(new Pause(finger, Duration.ofMillis(1500)));
    sequence.addAction(
        finger.createPointerMove(Duration.ofMillis(2000), Origin.fromElement(toElement), 0, 0));
    sequence.addAction(new Pause(finger, Duration.ofMillis(1500)));
    sequence.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));
    driver.perform(Collections.singletonList(sequence));
  }

  private static void sleep(double seconds) {
    if (seconds <= 0) return;
    try {
      Thread.sleep((long) (seconds * 1000d));
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  // endregion
}
