package ai.alumnium.driver.appium;

import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.accessibility.UIAutomator2AccessibilityTree;
import ai.alumnium.accessibility.XCUITestAccessibilityTree;
import ai.alumnium.driver.AppiumDriver.Platform;
import ai.alumnium.driver.Key;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.remote.SupportsContextSwitching;
import java.util.Map;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Native-context strategy: uses platform XML source and native gestures. */
public final class NativeAppiumViewStrategy implements AppiumViewStrategy {

  private static final Logger LOG = LoggerFactory.getLogger(NativeAppiumViewStrategy.class);

  private final AppiumViewContext ctx;

  public NativeAppiumViewStrategy(AppiumViewContext ctx) {
    this.ctx = ctx;
  }

  @Override
  public BaseAccessibilityTree accessibilityTree() {
    ensureNativeContext();
    sleep(ctx.delay());
    if (ctx.doubleFetchPageSource()) {
      ctx.driver().getPageSource();
    }
    String xml = ctx.driver().getPageSource();
    return ctx.platform() == Platform.UIAUTOMATOR2
        ? new UIAutomator2AccessibilityTree(xml)
        : new XCUITestAccessibilityTree(xml);
  }

  @Override
  public WebElement findElement(int id) {
    AccessibilityElement element = accessibilityTree().elementById(id);
    return ctx.platform() == Platform.XCUITEST
        ? findElementIos(element)
        : findElementAndroid(element);
  }

  @Override
  public void click(int id) {
    ensureNativeContext();
    WebElement element = findElement(id);
    scrollIntoView(element);
    element.click();
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    ensureNativeContext();
    WebElement from = findElement(fromId);
    WebElement to = findElement(toId);
    scrollIntoView(from);
    int fromX = from.getLocation().getX() + from.getSize().getWidth() / 2;
    int fromY = from.getLocation().getY() + from.getSize().getHeight() / 2;
    int toX = to.getLocation().getX() + to.getSize().getWidth() / 2;
    int toY = to.getLocation().getY() + to.getSize().getHeight() / 2;
    if (ctx.platform() == Platform.UIAUTOMATOR2) {
      ctx.driver()
          .executeScript(
              "mobile: dragGesture",
              Map.<String, Object>of(
                  "startX", fromX, "startY", fromY, "endX", toX, "endY", toY, "speed", 2500));
    } else {
      ctx.driver()
          .executeScript(
              "mobile: drag",
              Map.<String, Object>of(
                  "startX", (double) fromX,
                  "startY", (double) fromY,
                  "endX", (double) toX,
                  "endY", (double) toY,
                  "duration", 1.0));
    }
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
    new Actions(ctx.driver()).sendKeys(code).perform();
  }

  @Override
  public void type(int id, String text) {
    ensureNativeContext();
    WebElement element = findElement(id);
    scrollIntoView(element);
    element.clear();
    element.sendKeys(text);
    if (ctx.hideKeyboardAfterTyping()) {
      hideKeyboard();
    }
  }

  @Override
  public void scrollTo(int id) {
    scrollIntoView(findElement(id));
  }

  @Override
  public String title() {
    ensureWebviewContext();
    try {
      return ctx.driver().getTitle();
    } catch (RuntimeException e) {
      return "";
    }
  }

  @Override
  public String url() {
    ensureWebviewContext();
    try {
      return ctx.driver().getCurrentUrl();
    } catch (RuntimeException e) {
      return "";
    }
  }

  @Override
  public void executeScript(String script) {
    ensureWebviewContext();
    ctx.driver().executeScript(script);
  }

  // region Internals

  private WebElement findElementIos(AccessibilityElement element) {
    StringBuilder predicate = new StringBuilder();
    predicate.append("type == \"").append(element.type()).append("\"");
    appendPredicate(predicate, "name", element.name());
    appendPredicate(predicate, "value", element.value());
    appendPredicate(predicate, "label", element.label());
    return ctx.driver().findElement(AppiumBy.iOSNsPredicateString(predicate.toString()));
  }

  private static void appendPredicate(StringBuilder out, String key, String value) {
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
    return ctx.driver().findElement(By.xpath(xpath.toString()));
  }

  private static void appendXpathPredicate(StringBuilder out, String key, String value) {
    if (value == null || value.isEmpty()) return;
    if (out.length() > 0) out.append(" and ");
    out.append('@').append(key).append("=\"").append(value).append('\"');
  }

  private void hideKeyboard() {
    if (ctx.platform() == Platform.UIAUTOMATOR2) {
      ctx.driver().executeScript("mobile: hideKeyboard");
    } else {
      // Tap the top-left corner of the keyboard to dismiss it on iOS
      WebElement keyboard =
          ctx.driver()
              .findElement(AppiumBy.iOSNsPredicateString("type == \"XCUIElementTypeKeyboard\""));
      int w = keyboard.getSize().getWidth();
      int h = keyboard.getSize().getHeight();
      new Actions(ctx.driver())
          .moveToElement(keyboard)
          .moveByOffset(-(int) Math.ceil(w / 2.0), -(int) Math.ceil(h / 2.0))
          .click()
          .perform();
    }
  }

  private void scrollIntoView(WebElement element) {
    if (ctx.platform() == Platform.UIAUTOMATOR2) {
      scrollIntoViewAndroid(element);
    } else {
      ctx.driver()
          .executeScript(
              "mobile: scrollToElement",
              Map.of("elementId", ((org.openqa.selenium.remote.RemoteWebElement) element).getId()));
    }
  }

  private void scrollIntoViewAndroid(WebElement element) {
    if (element.isDisplayed()) return;

    Map<String, Long> windowSize =
        ctx.driver().manage().window().getSize() != null
            ? Map.of(
                "width", (long) ctx.driver().manage().window().getSize().getWidth(),
                "height", (long) ctx.driver().manage().window().getSize().getHeight())
            : Map.of("width", 0L, "height", 0L);

    long width = windowSize.get("width");
    long height = windowSize.get("height");
    long centerX = width / 2;
    long startY = (long) (height * 0.8);
    long endY = (long) (height * 0.2);

    for (int i = 0; i < 10; i++) {
      try {
        if (element.isDisplayed()) {
          LOG.debug("Element scrolled into view after {} swipes", i);
          return;
        }
      } catch (RuntimeException e) {
        LOG.debug("Element check failed during scroll: {}", e.getMessage());
      }
      LOG.debug("Performing swipe {}/10", i + 1);
      ctx.driver()
          .executeScript(
              "mobile: swipeGesture",
              Map.of(
                  "left",
                  centerX - 50,
                  "top",
                  startY,
                  "width",
                  100L,
                  "height",
                  endY - startY,
                  "direction",
                  "up",
                  "percent",
                  0.75));
      sleep(0.1);
    }
    LOG.warn("Element not visible after 10 swipes; it may be off-screen");
  }

  private void ensureNativeContext() {
    if (!ctx.autoswitchContexts()) return;
    var switcher = (SupportsContextSwitching) ctx.driver();
    if (!"NATIVE_APP".equals(switcher.getContext())) {
      switcher.context("NATIVE_APP");
    }
  }

  private void ensureWebviewContext() {
    if (!ctx.autoswitchContexts()) return;
    var switcher = (SupportsContextSwitching) ctx.driver();
    var contexts = new java.util.ArrayList<>(switcher.getContextHandles());
    for (int i = contexts.size() - 1; i >= 0; i--) {
      String c = contexts.get(i);
      if (c.contains("WEBVIEW")) {
        switcher.context(c);
        return;
      }
    }
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
