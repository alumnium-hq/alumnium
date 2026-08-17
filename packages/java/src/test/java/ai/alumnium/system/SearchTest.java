package ai.alumnium.system;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import ai.alumnium.Provider;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIf;

@DisabledIf("isHeadlessPlaywright")
class SearchTest extends BaseTest {

  @BeforeAll
  static void configure() {
    Assumptions.assumeFalse(al.model().provider() == Provider.OLLAMA, "Poor instruction following");
  }

  static boolean isHeadlessPlaywright() {
    return "playwright".equals(System.getenv("ALUMNIUM_DRIVER"))
        && !"false".equalsIgnoreCase(System.getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS"));
  }

  @Test
  void searchTest() {
    navigate("https://search.brave.com");
    al.act("type 'selenium' into the search field, then press 'Enter'");
    al.check("page title contains selenium");
    assertEquals(al.get("atomic number"), 34L);
    al.check("search results contain selenium.dev");
    assertThrows(
        AssertionError.class, () -> al.check("search results do not contain selenium.dev"));
  }
}
