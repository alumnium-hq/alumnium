package ai.alumnium.examples;

import ai.alumnium.Alumni;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.openqa.selenium.chrome.ChromeDriver;
import org.junit.jupiter.api.Test;

class SearchOnBraveTest {

    @Test
    void searchOnBravePlaywright() {
        Page page = Playwright.create().chromium().launch().newPage();
        Alumni alumni = new Alumni(page);
        page.navigate("https://search.brave.com");
        alumni.doGoal("type 'selenium' into the search field, then press 'Enter'");
        alumni.check("page title contains selenium");
        alumni.check("search results contain selenium.dev");
        alumni.quit();
    }

    @Test
    void searchOnBraveSelenium() {
        ChromeDriver driver = new ChromeDriver();
        Alumni alumni = new Alumni(driver);
        driver.get("https://search.brave.com");
        alumni.doGoal("type 'selenium' into the search field, then press 'Enter'");
        alumni.check("page title contains selenium");
        alumni.check("search results contain selenium.dev");
        alumni.quit();
    }
}
