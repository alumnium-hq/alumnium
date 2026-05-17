package ai.alumnium.system;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SearchTest extends BaseTest {
  @Test
  void searchTest() {
    driver.get("https://search.brave.com");
    al.act("type 'selenium' into the search field, then press 'Enter'");
    al.check("page title contains selenium");
    al.check("search results contain selenium.dev");
    assertEquals(al.get("atomic number").toObject(), 34L);
  }
}
