package ai.alumnium.system;

import ai.alumnium.Area;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium-ios")
public class TableTest extends BaseTest {

  private static final String TABLE_URL = "https://the-internet.herokuapp.com/tables";

  @Test
  void testTableExtraction() {
    navigate(TABLE_URL);

    Area table1 = al.area("first table");
    Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table1.get("first names"));
    Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table1.get("last names"));
    Assertions.assertEquals(
        List.of("$50.00", "$51.00", "$100.00", "$50.00"), table1.get("due amounts"));

    Area table2 = al.area("second table");
    Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names"));
    Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names"));
    Assertions.assertEquals(
        List.of("$50.00", "$51.00", "$100.00", "$50.00"), table2.get("due amounts"));
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
    Assertions.assertEquals(List.of("Frank", "Tim", "Jason", "John"), table1.get("first names"));
    Assertions.assertEquals(List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names"));

    table2 = al.area("second table");
    Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names"));
    Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names"));

    table2.act("sort by first name");
    Assertions.assertEquals(List.of("Frank", "Jason", "John", "Tim"), table2.get("first names"));
    Assertions.assertEquals(List.of("Bach", "Doe", "Smith", "Conway"), table2.get("last names"));

    Assertions.assertEquals(List.of("Frank", "Tim", "Jason", "John"), table1.get("first names"));
    Assertions.assertEquals(List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names"));
  }
}
