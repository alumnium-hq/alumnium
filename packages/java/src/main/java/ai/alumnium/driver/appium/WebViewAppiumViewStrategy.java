package ai.alumnium.driver.appium;

import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.accessibility.WebViewAccessibilityTree;
import ai.alumnium.driver.Key;
import java.util.List;
import java.util.Map;
import org.openqa.selenium.By;
import org.openqa.selenium.ElementNotInteractableException;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;

/** WebView-context strategy: parses HTML source and locates elements via CSS selectors. */
public final class WebViewAppiumViewStrategy implements AppiumViewStrategy {

  private final AppiumViewContext ctx;

  public WebViewAppiumViewStrategy(AppiumViewContext ctx) {
    this.ctx = ctx;
  }

  @Override
  public BaseAccessibilityTree accessibilityTree() {
    // The value IDL attribute (set via JS) is not serialised into outerHTML; copy it to a
    // data attribute first so that WebViewAccessibilityTree can expose it to the AI.
    try {
      ((JavascriptExecutor) ctx.driver())
          .executeScript(
              "document.querySelectorAll('input,textarea,select').forEach(function(el){"
                  + "el.setAttribute('data-al-live-value',el.value);});");
    } catch (Exception ignored) {
    }
    String html = ctx.driver().getPageSource();
    return new WebViewAccessibilityTree(html);
  }

  @Override
  public WebElement findElement(int id) {
    AccessibilityElement element = accessibilityTree().elementById(id);
    Map<String, Object> locator = element.locatorInfo();
    if (locator == null || !locator.containsKey("selector")) {
      throw new IllegalStateException(
          "WebView element " + id + " has no CSS selector in locatorInfo");
    }
    String selector = String.valueOf(locator.get("selector"));
    int nth = locator.containsKey("nth") ? ((Number) locator.get("nth")).intValue() : 0;
    List<WebElement> matches = ctx.driver().findElements(By.cssSelector(selector));
    if (nth < matches.size()) {
      return matches.get(nth);
    }
    throw new IllegalStateException("No element for selector " + selector + " nth=" + nth);
  }

  @Override
  public void click(int id) {
    WebElement element = findElement(id);
    try {
      new Actions(ctx.driver()).moveToElement(element).click().perform();
    } catch (RuntimeException e) {
      element.click();
    }
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    WebElement from = findElement(fromId);
    WebElement to = findElement(toId);
    // Touch pointer gestures do not trigger HTML5 dragstart/drop events on mobile Chrome;
    // dispatch drag events directly via JavaScript instead.
    ((JavascriptExecutor) ctx.driver())
        .executeScript(
            "var dt = new DataTransfer();"
                + "arguments[0].dispatchEvent(new DragEvent('dragstart', {dataTransfer: dt,"
                + " bubbles: true}));"
                + "arguments[1].dispatchEvent(new DragEvent('dragover',  {dataTransfer: dt,"
                + " bubbles: true}));"
                + "arguments[1].dispatchEvent(new DragEvent('drop',      {dataTransfer: dt,"
                + " bubbles: true}));"
                + "arguments[0].dispatchEvent(new DragEvent('dragend',   {dataTransfer: dt,"
                + " bubbles: true}));",
            from,
            to);
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
    WebElement element = findElement(id);
    ((JavascriptExecutor) ctx.driver())
        .executeScript("arguments[0].scrollIntoView(true);", element);
    try {
      element.clear();
      element.sendKeys(text);
    } catch (ElementNotInteractableException e) {
      // Element may be covered by an overlay (e.g. consent dialog) on mobile; use JS input.
      ((JavascriptExecutor) ctx.driver())
          .executeScript(
              "arguments[0].focus();"
                  + "var s = Object.getOwnPropertyDescriptor("
                  + "  window.HTMLInputElement.prototype,'value').set;"
                  + "s.call(arguments[0],arguments[1]);"
                  + "arguments[0].dispatchEvent(new Event('input',{bubbles:true}));"
                  + "arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
              element,
              text);
    }
  }

  @Override
  public void scrollTo(int id) {
    ((JavascriptExecutor) ctx.driver())
        .executeScript("arguments[0].scrollIntoView();", findElement(id));
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
}
