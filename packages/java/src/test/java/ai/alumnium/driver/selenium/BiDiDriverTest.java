package ai.alumnium.driver.selenium;

import static org.assertj.core.api.Assertions.assertThat;

import ai.alumnium.driver.SeleniumDriver;
import java.lang.reflect.Proxy;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.Capabilities;
import org.openqa.selenium.HasCapabilities;
import org.openqa.selenium.MutableCapabilities;
import org.openqa.selenium.WebDriver;

class BiDiDriverTest {

  @Test
  void waitsForNavigationsFinishedOutOfOrder() {
    BiDiDriver driver = new BiDiDriver(webDriver("firefox"));

    driver.withNavigationWait(
        () -> {
          // Load is handled before the navigation start, as callbacks run in a thread pool
          driver.onNavigationEvent(
              "browsingContext.load", Map.of("context", "tab", "navigation", "nav"));
          driver.onNavigationEvent(
              "browsingContext.navigationStarted", Map.of("context", "tab", "navigation", "nav"));
          driver.onNavigationEvent("browsingContext.contextCreated", Map.of("context", "new"));
        });

    assertThat(driver.pendingNavigations()).isZero();
  }

  @Test
  void ignoresNavigationEventsOutsideActions() {
    BiDiDriver driver = new BiDiDriver(webDriver("firefox"));

    driver.onNavigationEvent(
        "browsingContext.navigationStarted", Map.of("context", "tab", "navigation", "nav"));

    assertThat(driver.pendingNavigations()).isZero();
  }

  @Test
  void ofCreatesBiDiDriverForFirefox() {
    SeleniumDriver driver = SeleniumDriver.of(webDriver("firefox"));

    assertThat(driver).isInstanceOf(BiDiDriver.class);
    assertThat(driver.platform()).isEqualTo("firefox");
  }

  /** WebDriver without BiDi, so BiDiDriver only logs that it can't set up page scripts. */
  static WebDriver webDriver(String browserName) {
    MutableCapabilities capabilities = new MutableCapabilities(Map.of("browserName", browserName));
    return (WebDriver)
        Proxy.newProxyInstance(
            BiDiDriverTest.class.getClassLoader(),
            new Class<?>[] {WebDriver.class, HasCapabilities.class},
            (proxy, method, args) ->
                method.getReturnType() == Capabilities.class ? capabilities : null);
  }
}
