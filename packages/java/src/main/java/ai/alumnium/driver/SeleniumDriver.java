package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.driver.selenium.BiDiDriver;
import ai.alumnium.driver.selenium.CdpDriver;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;
import ai.alumnium.tool.DragAndDropTool;
import ai.alumnium.tool.HoverTool;
import ai.alumnium.tool.PressKeyTool;
import ai.alumnium.tool.TypeTool;
import ai.alumnium.tool.UploadTool;
import ai.alumnium.util.Retry;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openqa.selenium.HasCapabilities;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.interactions.Interactive;
import org.openqa.selenium.interactions.WheelInput;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * WebDriver actions shared by the browser-specific Selenium drivers, which differ in how they build
 * accessibility trees and locate elements.
 */
public abstract non-sealed class SeleniumDriver extends BaseDriver {

  private static final Logger LOG = LoggerFactory.getLogger(SeleniumDriver.class);

  protected static final String WAITER_SCRIPT = loadScript("/ai/alumnium/driver/scripts/waiter.js");

  protected final WebDriver driver;
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

  /** Returns {@link BiDiDriver} for Firefox and {@link CdpDriver} for Chromium browsers. */
  public static SeleniumDriver of(WebDriver driver) {
    if (driver instanceof HasCapabilities hasCapabilities
        && "firefox".equalsIgnoreCase(hasCapabilities.getCapabilities().getBrowserName())) {
      return new BiDiDriver(driver);
    } else {
      return new CdpDriver(driver);
    }
  }

  /** Subclasses call {@link #initPageScripts()} once they are constructed. */
  protected SeleniumDriver(WebDriver driver) {
    this.driver = driver;
  }

  protected abstract void initPageScripts();

  protected void closeConnections() {}

  protected void withNavigationWait(Runnable action) {
    action.run();
  }

  @Override
  public abstract WebElement findElement(int id);

  @Override
  public Set<Class<? extends BaseTool>> supportedTools() {
    return supportedTools;
  }

  // region Actions

  @Override
  public void click(int id) {
    withTabAutoswitch(
        () -> {
          WebElement element = findElement(id);
          scrollElementIntoCenter(element);
          try {
            new Actions(driver).moveToElement(element).click().perform();
          } catch (RuntimeException e) {
            element.click();
          }
        });
  }

  @Override
  public void dragSlider(int id, double value) {
    WebElement element = findElement(id);
    scrollElementIntoCenter(element);
    JavascriptExecutor executor = (JavascriptExecutor) driver;
    boolean isSlider =
        Slider.set(
            new Slider.Actions() {
              @Override
              public Object next(boolean reset) {
                return executor.executeScript(Slider.EXECUTE_SCRIPT, element, value, reset);
              }

              // Pointer offsets are relative to the element's center. The pointer stays
              // pressed between performs until it is released.
              @Override
              public void down(Slider.Point point) {
                Slider.Offset offset = point.centerOffset();
                new Actions(driver)
                    .moveToElement(element, (int) offset.x(), (int) offset.y())
                    .clickAndHold()
                    .perform();
              }

              @Override
              public void move(Slider.Point point) {
                Slider.Offset offset = point.centerOffset();
                new Actions(driver, Duration.ofMillis(100))
                    .moveToElement(element, (int) offset.x(), (int) offset.y())
                    .perform();
              }

              @Override
              public void up() {
                new Actions(driver).release().perform();
              }
            });
    if (!isSlider) {
      executor.executeScript(Slider.SET_INPUT_VALUE_SCRIPT, element, Double.toString(value));
    }
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    WebElement fromElement = findElement(fromId);
    WebElement toElement = findElement(toId);
    scrollElementIntoCenter(fromElement);
    new Actions(driver).dragAndDrop(fromElement, toElement).perform();
  }

  @Override
  public void hover(int id) {
    WebElement element = findElement(id);
    scrollElementIntoCenter(element);
    new Actions(driver).moveToElement(element).perform();
  }

  @Override
  public void pressKey(Key key) {
    withTabAutoswitch(
        () -> {
          CharSequence keyStroke =
              switch (key) {
                case BACKSPACE -> org.openqa.selenium.Keys.BACK_SPACE;
                case ENTER -> org.openqa.selenium.Keys.ENTER;
                case ESCAPE -> org.openqa.selenium.Keys.ESCAPE;
                case SPACE -> org.openqa.selenium.Keys.SPACE;
                case TAB -> org.openqa.selenium.Keys.TAB;
                case ARROW_DOWN -> org.openqa.selenium.Keys.ARROW_DOWN;
                case ARROW_UP -> org.openqa.selenium.Keys.ARROW_UP;
                case ARROW_LEFT -> org.openqa.selenium.Keys.ARROW_LEFT;
                case ARROW_RIGHT -> org.openqa.selenium.Keys.ARROW_RIGHT;
                case HOME -> org.openqa.selenium.Keys.HOME;
                case END -> org.openqa.selenium.Keys.END;
                case PAGE_UP -> org.openqa.selenium.Keys.PAGE_UP;
                case PAGE_DOWN -> org.openqa.selenium.Keys.PAGE_DOWN;
              };
          new Actions(driver).sendKeys(keyStroke).perform();
        });
  }

  @Override
  public void quit() {
    closeConnections();
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
  public void scrollTo(int id) {
    scrollElementIntoCenter(findElement(id));
  }

  @Override
  public void scrollInDirection(int id, ScrollDirection direction) {
    Object result =
        ((JavascriptExecutor) driver).executeScript(ScrollArea.EXECUTE_SCRIPT, findElement(id));
    ScrollArea.Measurement area = ScrollArea.Measurement.of(result, id);
    WheelInput.ScrollOrigin origin =
        WheelInput.ScrollOrigin.fromViewport(
            (int) Math.round(area.viewportX()), (int) Math.round(area.viewportY()));
    ScrollArea.Delta delta = area.wheelDelta(direction);
    new Actions(driver).scrollFromOrigin(origin, delta.x(), delta.y()).perform();
    sleep(ScrollArea.SETTLE_DELAY_MS);
  }

  @Override
  public void panInDirection(int id, ScrollDirection direction) {
    WebElement element = findElement(id);
    scrollElementIntoCenter(element);
    // Pointer offsets are relative to the center of the element's visible part.
    MapGestures.Frame size = visibleSize(element);
    MapGestures.Drag drag =
        new MapGestures.Frame(-size.width() / 2, -size.height() / 2, size.width(), size.height())
            .pan(direction);
    // Drag like a user: maps ignore a press and release without moves between,
    // and fling when released while the pointer is still moving.
    Actions actions =
        new Actions(driver, Duration.ofMillis(20))
            .moveToElement(
                element, (int) Math.round(drag.start().x()), (int) Math.round(drag.start().y()))
            .clickAndHold();
    for (int step = 1; step <= MapGestures.PAN_STEPS; step++) {
      double progress = (double) step / MapGestures.PAN_STEPS;
      actions.moveToElement(
          element,
          (int) Math.round(drag.start().x() + (drag.end().x() - drag.start().x()) * progress),
          (int) Math.round(drag.start().y() + (drag.end().y() - drag.start().y()) * progress));
    }
    try {
      actions.pause(Duration.ofMillis(MapGestures.PAN_HOLD_DELAY_MS)).release().perform();
    } catch (RuntimeException e) {
      // A failed move would leave the button held for the rest of the session.
      if (driver instanceof Interactive interactive) {
        interactive.resetInputState();
      }
      throw e;
    }
    sleep(MapGestures.PAN_SETTLE_DELAY_MS);
  }

  @Override
  public void zoom(int id, ZoomDirection direction) {
    WebElement element = findElement(id);
    scrollElementIntoCenter(element);
    // Wheel with Control held is what a trackpad pinch sends. Maps zoom on it
    // even when they leave the plain wheel to the page.
    // Each wheel move is performed on its own: Chrome drops moves that are
    // chained into one sequence. Control stays held between performs.
    WheelInput.ScrollOrigin origin = WheelInput.ScrollOrigin.fromElement(element);
    new Actions(driver).keyDown(org.openqa.selenium.Keys.CONTROL).perform();
    try {
      for (int step = 0; step < MapGestures.ZOOM_WHEEL_STEPS; step++) {
        new Actions(driver)
            .scrollFromOrigin(origin, 0, MapGestures.zoomWheelDelta(direction))
            .perform();
      }
    } finally {
      new Actions(driver).keyUp(org.openqa.selenium.Keys.CONTROL).perform();
    }
    sleep(MapGestures.ZOOM_SETTLE_DELAY_MS);
  }

  /** The size of the element, limited to what fits on screen. */
  private MapGestures.Frame visibleSize(WebElement element) {
    var rect = element.getRect();
    List<?> viewport =
        (List<?>)
            ((JavascriptExecutor) driver)
                .executeScript("return [window.innerWidth, window.innerHeight];");
    return new MapGestures.Frame(0, 0, rect.getWidth(), rect.getHeight())
        .clipTo(((Number) viewport.get(0)).doubleValue(), ((Number) viewport.get(1)).doubleValue());
  }

  @Override
  public String title() {
    return driver.getTitle();
  }

  @Override
  public void type(int id, String text) {
    WebElement element = findElement(id);
    scrollElementIntoCenter(element);
    element.clear();
    element.sendKeys(text);
  }

  @Override
  public void upload(int id, List<String> paths) {
    WebElement element = findElement(id);
    element.sendKeys(String.join("\n", paths));
  }

  @Override
  public String url() {
    return driver.getCurrentUrl();
  }

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

  // endregion
  // region Internals

  protected void scrollElementIntoCenter(WebElement element) {
    ((JavascriptExecutor) driver)
        .executeScript("arguments[0].scrollIntoView({block: 'center'});", element);
  }

  protected void waitForPageToLoad() {
    Retry.Options options = new Retry.Options();
    options.maxAttempts = 2;
    options.backOffMillis = 0L;
    try {
      Retry.execute(
          options,
          () -> {
            PageWaiter.Result result = new PageWaiter(this::waiterSnapshot).waitForPageStability();
            if (!result.loaded()) {
              LOG.debug("Timed out waiting for page; pending requests: {}", result.pending());
            }
            return null;
          });
    } catch (RuntimeException e) {
      LOG.debug("waitForPageToLoad threw after retry", e);
    }
  }

  private PageWaiter.Snapshot waiterSnapshot() {
    JavascriptExecutor javascript = (JavascriptExecutor) driver;
    Object value = javascript.executeScript("return " + PageWaiter.WAITER_SNAPSHOT_SCRIPT);
    if (value == null) {
      javascript.executeScript(WAITER_SCRIPT);
      value = javascript.executeScript("return " + PageWaiter.WAITER_SNAPSHOT_SCRIPT);
    }
    if (!(value instanceof Map<?, ?> snapshot)) return null;
    return PageWaiter.Snapshot.fromScript(snapshot);
  }

  private void withTabAutoswitch(Runnable action) {
    if (!autoswitchToNewTab) {
      withNavigationWait(action);
      return;
    }
    List<String> before = new ArrayList<>(driver.getWindowHandles());
    withNavigationWait(action);
    List<String> after = new ArrayList<>(driver.getWindowHandles());
    after.removeAll(before);
    if (!after.isEmpty()) {
      String newest = after.get(after.size() - 1);
      if (!newest.equals(driver.getWindowHandle())) {
        driver.switchTo().window(newest);
      }
    }
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  // endregion
}
