package ai.alumnium.system;

import ai.alumnium.Alumni;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.openqa.selenium.chrome.ChromeDriver;

public class BaseTest {

  protected static Alumni al;

  private static final String DRIVER_TYPE =
      System.getenv().getOrDefault("ALUMNIUM_DRIVER", "selenium");

  private static ChromeDriver seleniumDriver;
  private static Playwright playwright;
  private static Browser browser;
  private static Page playwrightPage;

  @RegisterExtension
  static final AlumniCacheExtension cacheAfterEach = new AlumniCacheExtension(() -> al);

  @BeforeAll
  static void setUp() {
    Alumni.Options options = new Alumni.Options().withUrl("http://127.0.0.1:8013");

    if ("playwright".equals(DRIVER_TYPE)) {
      playwright = Playwright.create();
      browser = playwright.chromium().launch();
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
  }

  protected static void navigate(String url) {
    if ("playwright".equals(DRIVER_TYPE)) {
      playwrightPage.navigate(url);
    } else {
      seleniumDriver.get(url);
    }
  }
}
