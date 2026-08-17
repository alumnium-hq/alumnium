package ai.alumnium.system;

import ai.alumnium.Area;
import ai.alumnium.Provider;
import ai.alumnium.driver.AppiumDriver;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

public class TableTest extends BaseTest {

  private static final String TABLE_URL = "https://the-internet.herokuapp.com/tables";

  @BeforeAll
  static void configure() {
    Assumptions.assumeFalse(
        al.model().provider() == Provider.AWS_META, "Table area instructions need more work");
    Assumptions.assumeFalse(
        al.driver() instanceof AppiumDriver,
        "Area is not properly extracted from Appium source code.");

    if (al.model().provider() == Provider.MISTRALAI) {
      al.learn("sort by web site", List.of("click 'Web Site' header"));
    }
  }

  @Test
  void testTableExtraction() {
    navigate(TABLE_URL);

    Area area = al.area("first table");
    Assertions.assertEquals("$100.00", area.get("Jason Doe's due amount"));
    Assertions.assertEquals("$51.00", area.get("Frank Bach's due amount"));
    Assertions.assertEquals("$50.00", area.get("Tim Conway's due amount"));
    Assertions.assertEquals("$50.00", area.get("John Smith's due amount"));
  }

  @Test
  void testTableSorting() {
    navigate(TABLE_URL);

    Area table1 = al.area("first table");
    Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table1.get("first names"));
    Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table1.get("last names"));

    Area table2 = al.area("second table");
    Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names"));
    Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names"));

    table1.act("sort by last name");
    table1 = al.area("first table");
    Assertions.assertEquals(List.of("Frank", "Tim", "Jason", "John"), table1.get("first names"));
    Assertions.assertEquals(List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names"));

    table2 = al.area("second table");
    Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names"));
    Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names"));

    table2.act("sort by first name");
    table2 = al.area("second table");
    Assertions.assertEquals(List.of("Frank", "Jason", "John", "Tim"), table2.get("first names"));
    Assertions.assertEquals(List.of("Bach", "Doe", "Smith", "Conway"), table2.get("last names"));

    table1 = al.area("first table");
    Assertions.assertEquals(List.of("Frank", "Tim", "Jason", "John"), table1.get("first names"));
    Assertions.assertEquals(List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names"));
  }

  @Test
  void testRetrievalOfUnavailableData() {
    navigate(TABLE_URL);

    Object result = al.get("atomic number of Selenium");
    Assertions.assertInstanceOf(String.class, result);
    Assertions.assertFalse(((String) result).toLowerCase().contains("34"));
  }
}
