package ai.alumnium.unit.driver;

import static org.assertj.core.api.Assertions.assertThat;

import ai.alumnium.driver.AppiumDriver;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.MutableCapabilities;

class AppiumDriverAppTest {

  private static final String URL = "https://www.bstackdemo.com/checkout";

  @Test
  void identifiesNativeAppsByBundleId() {
    AtomicBoolean urlRead = new AtomicBoolean();
    String app =
        AppiumDriver.appId(
            caps(Map.of("appium:bundleId", "com.example.todo")),
            () -> {
              urlRead.set(true);
              return URL;
            });

    assertThat(app).isEqualTo("com.example.todo");
    assertThat(urlRead).isFalse();
  }

  @Test
  void identifiesNativeAppsByPackage() {
    assertThat(AppiumDriver.appId(caps(Map.of("appium:appPackage", "com.example.todo")), () -> URL))
        .isEqualTo("com.example.todo");
  }

  @Test
  void identifiesWebsitesInSafariByHost() {
    assertThat(
            AppiumDriver.appId(
                caps(Map.of("appium:bundleId", "com.apple.mobilesafari")), () -> URL))
        .isEqualTo("www.bstackdemo.com");
  }

  @Test
  void identifiesWebsitesInChromeByHost() {
    assertThat(
            AppiumDriver.appId(caps(Map.of("appium:appPackage", "com.android.chrome")), () -> URL))
        .isEqualTo("www.bstackdemo.com");
  }

  @Test
  void identifiesWebsitesInBrowserSessionsByHost() {
    assertThat(AppiumDriver.appId(caps(Map.of("browserName", "Safari")), () -> URL))
        .isEqualTo("www.bstackdemo.com");
  }

  @Test
  void keepsBlankPagesUnknown() {
    assertThat(
            AppiumDriver.appId(
                caps(Map.of("appium:bundleId", "com.apple.mobilesafari")), () -> "about:blank"))
        .isEqualTo("unknown");
  }

  @Test
  void fallsBackToBundleIdWhenUrlIsUnavailable() {
    assertThat(
            AppiumDriver.appId(caps(Map.of("appium:bundleId", "com.apple.mobilesafari")), () -> ""))
        .isEqualTo("com.apple.mobilesafari");
  }

  private static MutableCapabilities caps(Map<String, Object> values) {
    return new MutableCapabilities(values);
  }
}
