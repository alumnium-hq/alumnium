package ai.alumnium.system;

import ai.alumnium.Alumni;
import ai.alumnium.Model;
import ai.alumnium.Provider;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.chrome.ChromeDriver;

class SearchOnBraveTest {

  @Test
  void searchOnBravePlaywright() {
    Page page = Playwright.create().chromium().launch().newPage();
    Alumni alumni = new Alumni(page);
    page.navigate("https://search.brave.com");
    alumni.act("type 'selenium' into the search field, then press 'Enter'");
    alumni.check("page title contains selenium");
    alumni.check("search results contain selenium.dev");
    alumni.close();
  }

  @Test
  void searchOnBraveSelenium() {
    Alumni.Options opts =
        new Alumni.Options()
            .withUrl("http://127.0.0.1:8013")
            .withModel(new Model(Provider.ANTHROPIC, "claude-haiku-4-5-20251001"))
            .withPlanner(true)
            .withChangeAnalysis(true);

    ChromeDriver driver = new ChromeDriver();
    Alumni alumni = new Alumni(driver, opts);
    driver.get("https://search.brave.com");
    alumni.act("type 'selenium' into the search field, then press 'Enter'");
    alumni.check("page title contains selenium");
    alumni.check("search results contain selenium.dev");
    alumni.close();
  }
}
