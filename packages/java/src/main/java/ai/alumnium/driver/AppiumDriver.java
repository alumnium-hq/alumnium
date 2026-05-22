package ai.alumnium.driver;

import ai.alumnium.Config;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.driver.appium.AppiumViewContext;
import ai.alumnium.driver.appium.AppiumViewStrategy;
import ai.alumnium.driver.appium.ChromiumAppiumViewStrategy;
import ai.alumnium.driver.appium.NativeAppiumViewStrategy;
import ai.alumnium.driver.appium.WebViewAppiumViewStrategy;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ClickTool;
import ai.alumnium.tool.DragAndDropTool;
import ai.alumnium.tool.PressKeyTool;
import ai.alumnium.tool.TypeTool;
import io.appium.java_client.remote.SupportsContextSwitching;
import java.util.Set;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;

/**
 * Appium (mobile) implementation of {@link BaseDriver}.
 *
 * <p>Dispatches every action and accessibility snapshot to the correct {@link AppiumViewStrategy}
 * based on the current Appium context:
 *
 * <ul>
 *   <li>{@code NATIVE_APP} (or unknown) → {@link NativeAppiumViewStrategy}
 *   <li>Contains {@code WEBVIEW} → {@link WebViewAppiumViewStrategy}
 *   <li>{@code CHROMIUM} + driver implements {@code HasCdp} → {@link ChromiumAppiumViewStrategy}
 *   <li>{@code CHROMIUM} without CDP (e.g. {@code AndroidDriver} on Chrome) → {@link
 *       WebViewAppiumViewStrategy}
 * </ul>
 */
public final class AppiumDriver extends BaseDriver {

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

  // region BaseDriver delegation

  @Override
  public BaseAccessibilityTree accessibilityTree() {
    return currentStrategy().accessibilityTree();
  }

  @Override
  public void click(int id) {
    currentStrategy().click(id);
  }

  @Override
  public void dragSlider(int id, double value) {
    throw new UnsupportedOperationException("dragSlider not supported for Appium");
  }

  @Override
  public void dragAndDrop(int fromId, int toId) {
    currentStrategy().dragAndDrop(fromId, toId);
  }

  @Override
  public void pressKey(Key key) {
    currentStrategy().pressKey(key);
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
    currentStrategy().scrollTo(id);
  }

  @Override
  public String title() {
    return currentStrategy().title();
  }

  @Override
  public void type(int id, String text) {
    currentStrategy().type(id, text);
  }

  @Override
  public String url() {
    return currentStrategy().url();
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
  public Element findElement(int id) {
    return new Element.Appium(currentStrategy().findRaw(id));
  }

  @Override
  public void executeScript(String script) {
    currentStrategy().executeScript(script);
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

  private AppiumViewStrategy currentStrategy() {
    AppiumViewContext ctx =
        new AppiumViewContext(
            driver,
            platform,
            autoswitchContexts,
            hideKeyboardAfterTyping,
            doubleFetchPageSource,
            delay);
    String context = ((SupportsContextSwitching) driver).getContext();
    if (context != null && context.toUpperCase().contains("WEBVIEW")) {
      return new WebViewAppiumViewStrategy(ctx);
    }
    if ("CHROMIUM".equalsIgnoreCase(context)) {
      // AndroidDriver does not implement HasCdp; fall back to HTML-based parsing
      if (driver instanceof org.openqa.selenium.chromium.HasCdp) {
        return new ChromiumAppiumViewStrategy(ctx);
      }
      return new WebViewAppiumViewStrategy(ctx);
    }
    return new NativeAppiumViewStrategy(ctx);
  }
}
