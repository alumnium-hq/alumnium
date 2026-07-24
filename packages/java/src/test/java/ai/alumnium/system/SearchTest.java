package ai.alumnium.system;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIf;

@DisabledIf("isHeadlessPlaywright")
class SearchTest extends BaseTest {

  static boolean isHeadlessPlaywright() {
    return "playwright".equals(System.getenv("ALUMNIUM_DRIVER"))
        && !"false".equalsIgnoreCase(System.getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS"));
  }

  @Test
  void searchTest() {
    navigate("https://search.brave.com");
    al.act("type 'selenium' into the search field, then press 'Enter'");
    al.check("page title contains selenium");
    al.check("search results contain selenium.dev");
    assertEquals(al.get("atomic number"), 34L);
  }
}
