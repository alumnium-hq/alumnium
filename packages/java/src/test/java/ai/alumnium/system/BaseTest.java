package ai.alumnium.system;

import ai.alumnium.Alumni;
import ai.alumnium.tool.BaseTool;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import java.util.List;
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
  private static final boolean PLAYWRIGHT_HEADLESS =
      !"false".equalsIgnoreCase(System.getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS"));

  private static ChromeDriver seleniumDriver;
  private static Playwright playwright;
  private static Browser browser;
  private static Page playwrightPage;

  @RegisterExtension
  static final AlumniCacheExtension cacheAfterEach = new AlumniCacheExtension(() -> al);

  @BeforeAll
  static void setUp(TestInfo info) {
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

    if ("playwright".equals(DRIVER_TYPE)) {
      playwright = Playwright.create();
      browser =
          playwright
              .chromium()
              .launch(new BrowserType.LaunchOptions().setHeadless(PLAYWRIGHT_HEADLESS));
      playwrightPage = browser.newPage();
      al = new Alumni(playwrightPage, options);
    } else {
      seleniumDriver = new ChromeDriver();
      al = new Alumni(seleniumDriver, options);
    }
  }

  @AfterAll
  static void tearDown() {
    al.close();
    extraTools = List.of();
  }

  protected static void navigate(String url) {
    if ("playwright".equals(DRIVER_TYPE)) {
      playwrightPage.navigate(url);
    } else {
      seleniumDriver.get(url);
    }
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
