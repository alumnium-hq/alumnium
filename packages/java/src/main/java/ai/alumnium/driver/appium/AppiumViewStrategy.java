package ai.alumnium.driver.appium;

import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.driver.Key;
import org.openqa.selenium.WebElement;

/** View-specific behaviour for Appium actions and accessibility snapshots. */
public sealed interface AppiumViewStrategy
    permits NativeAppiumViewStrategy, WebViewAppiumViewStrategy, ChromiumAppiumViewStrategy {

  BaseAccessibilityTree accessibilityTree();

  WebElement findRaw(int id);

  void click(int id);

  void dragAndDrop(int fromId, int toId);

  void pressKey(Key key);

  void type(int id, String text);

  void scrollTo(int id);

  String title();

  String url();

  void executeScript(String script);
}
