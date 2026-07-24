package ai.alumnium.test;

import ai.alumnium.Alumni;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * Smoke test that verifies the alumnium package is installable from Maven and the CLI binary
 * auto-starts the server.
 */
class ExampleTest {

  @Test
  void alumniWorks() {
    try (Playwright pw = Playwright.create()) {
      Browser browser = pw.chromium().launch();
      Page page = browser.newPage();

      try (Alumni al = new Alumni(page)) {
        page.navigate("https://seleniumbase.io/apps/calculator");
        al.act("2 + 2 =");
        Assertions.assertEquals(4L, al.get("calculator result from textfield"));
      } finally {
        browser.close();
      }
    }
  }
}
