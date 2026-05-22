package ai.alumnium.driver.appium;

import ai.alumnium.accessibility.AccessibilityElement;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.accessibility.WebViewAccessibilityTree;
import ai.alumnium.driver.Key;
import java.util.List;
import java.util.Map;
import org.openqa.selenium.By;
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
    String html = ctx.driver().getPageSource();
    return new WebViewAccessibilityTree(html);
  }

  @Override
  public WebElement findRaw(int id) {
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
    WebElement element = findRaw(id);
    try {
      new Actions(ctx.driver()).moveToElement(element).click().perform();
    } catch (RuntimeException e) {
      element.click();
    }
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    new Actions(ctx.driver()).dragAndDrop(findRaw(fromId), findRaw(toId)).perform();
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
    ((JavascriptExecutor) ctx.driver())
        .executeScript("arguments[0].scrollIntoView();", findRaw(id));
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
