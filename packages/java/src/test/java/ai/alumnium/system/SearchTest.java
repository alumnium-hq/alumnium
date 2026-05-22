package ai.alumnium.system;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import org.junit.jupiter.api.Test;

class SearchTest extends BaseTest {
  @Test
  void searchTest() {
    assumeFalse(
        "playwright".equals(System.getenv("ALUMNIUM_DRIVER"))
            && !"false".equalsIgnoreCase(System.getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS")),
        "Brave Search blocks headless browsers");

    navigate("https://search.brave.com");
    al.act("type 'selenium' into the search field, then press 'Enter'");
    al.check("page title contains selenium");
    al.check("search results contain selenium.dev");
    assertEquals(al.get("atomic number"), 34L);
  }
}
