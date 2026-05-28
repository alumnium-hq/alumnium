package ai.alumnium.system;

import ai.alumnium.Alumni;
import ai.alumnium.driver.AppiumDriver;
import ai.alumnium.tool.BaseTool;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Playwright;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.android.options.UiAutomator2Options;
import io.appium.java_client.ios.IOSDriver;
import io.appium.java_client.ios.options.XCUITestOptions;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;

public class BaseTest {

  protected static Alumni al;
  protected static List<Class<? extends BaseTool>> extraTools = List.of();

  private static final String DRIVER_TYPE =
      System.getenv().getOrDefault("ALUMNIUM_DRIVER", "selenium");
  private static final String LT_USERNAME = System.getenv("LT_USERNAME");
  private static final String LT_ACCESS_KEY = System.getenv("LT_ACCESS_KEY");
  private static final boolean IS_LAMBDA_TEST = LT_USERNAME != null && LT_ACCESS_KEY != null;
  private static final boolean PLAYWRIGHT_HEADLESS =
      !"false".equalsIgnoreCase(System.getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS"));

  // Playwright-only: kept as fields so GC does not kill the Playwright process mid-run
  private static Playwright playwright;
  private static Browser browser;

  @RegisterExtension
  static final AlumniCacheExtension cacheAfterEach = new AlumniCacheExtension(() -> al);

  private static URL appiumUrl() throws MalformedURLException {
    String url =
        IS_LAMBDA_TEST
            ? "https://" + LT_USERNAME + ":" + LT_ACCESS_KEY + "@mobile-hub.lambdatest.com/wd/hub"
            : System.getenv().getOrDefault("APPIUM_URL", "http://127.0.0.1:4723/");
    return URI.create(url).toURL();
  }

  private static Map<String, Object> ltOptions(String build) {
    return Map.of(
        "build", build,
        "name", "JUnit (" + DRIVER_TYPE + ")",
        "isRealMobile", true,
        "network", false,
        "visual", true,
        "video", true,
        "w3c", true);
  }

  // io.appium.java_client.AppiumDriver conflicts with ai.alumnium.driver.AppiumDriver
  private static io.appium.java_client.AppiumDriver buildIosDriver() throws MalformedURLException {
    XCUITestOptions options = new XCUITestOptions();
    options.setPlatformName("iOS");
    options.setDeviceName("iPhone 17 Pro Max");
    options.setNoReset(true);

    if (IS_LAMBDA_TEST) {
      options.withBrowserName("Safari");
      options.setPlatformVersion("18");
      options.setCapability("lt:options", ltOptions("Java - iOS"));
    } else {
      options.setBundleId("com.apple.mobilesafari");
      options.setPlatformVersion("26.5");
      options.setNewCommandTimeout(Duration.ofSeconds(300));
    }

    return new IOSDriver(appiumUrl(), options);
  }

  private static io.appium.java_client.AppiumDriver buildAndroidDriver()
      throws MalformedURLException {
    UiAutomator2Options options = new UiAutomator2Options();
    options.setPlatformName("Android");
    options.setDeviceName("Android Device");
    options.setNoReset(true);
    options.withBrowserName("Chrome");

    if (IS_LAMBDA_TEST) {
      options.setPlatformVersion("14");
      options.setCapability("lt:options", ltOptions("Java - Android"));
    } else {
      options.setPlatformVersion("16.0");
      options.setChromeOptions(Map.of("androidKeepAppDataDir", true));
      options.setNewCommandTimeout(Duration.ofSeconds(300));
    }

    AndroidDriver driver = new AndroidDriver(appiumUrl(), options);
    if (!IS_LAMBDA_TEST) {
      driver.setSettings(
          Map.<String, Object>of("allowInvisibleElements", true, "ignoreUnimportantViews", true));
    }
    return driver;
  }

  @BeforeAll
  static void setUp(TestInfo info) throws MalformedURLException {
    // Force the concrete test class's <clinit> to run before we read
    // `extraTools`. The JVM only initializes BaseTest when this static method
    // is invoked, so any static initializer in a subclass that overrides
    // `extraTools` would otherwise run too late.
    info.getTestClass()
        .ifPresent(
            cls -> {
              try {
                Class.forName(cls.getName(), true, cls.getClassLoader());
              } catch (ClassNotFoundException ignored) {
                // unreachable: JUnit gave us the class already
              }
            });
    Alumni.Options options = new Alumni.Options().withExtraTools(extraTools);

    switch (DRIVER_TYPE) {
      case "playwright" -> {
        playwright = Playwright.create();
        browser =
            playwright
                .chromium()
                .launch(new BrowserType.LaunchOptions().setHeadless(PLAYWRIGHT_HEADLESS));
        al = new Alumni(browser.newPage(), options);
      }
      case "appium-ios" -> {
        al = new Alumni(buildIosDriver(), options);
        ((AppiumDriver) al.driver()).delay = 0.1;
      }
      case "appium-android" -> {
        al = new Alumni(buildAndroidDriver(), options);
        ((AppiumDriver) al.driver()).delay = 0.1;
      }
      default -> al = new Alumni(new ChromeDriver(), options);
    }
  }

  @AfterAll
  static void tearDown() {
    al.close();
    extraTools = List.of();
  }

  protected static void navigate(String url) {
    al.driver().visit(url);
  }

  protected static void type(Object element, String text) {
    if (element instanceof Locator locator) {
      locator.fill(text);
    } else if (element instanceof WebElement webElement) {
      webElement.sendKeys(text);
    } else {
      throw new IllegalArgumentException("Unsupported element type: " + element);
    }
  }

  protected static void click(Object element) {
    if (element instanceof Locator locator) {
      locator.click();
    } else if (element instanceof WebElement webElement) {
      webElement.click();
    } else {
      throw new IllegalArgumentException("Unsupported element type: " + element);
    }
  }
}
