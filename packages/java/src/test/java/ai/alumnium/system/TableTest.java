package ai.alumnium.system;

import ai.alumnium.Area;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public class TableTest extends BaseTest {

  private static final String TABLE_URL = "https://the-internet.herokuapp.com/tables";

  @Test
  void testTableExtraction() {
    driver.get(TABLE_URL);

    Area table1 = al.area("first table");
    Assertions.assertEquals(
        List.of("John", "Frank", "Jason", "Tim"), table1.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Smith", "Bach", "Doe", "Conway"), table1.get("last names").toObject());
    Assertions.assertEquals(
        List.of("$50.00", "$51.00", "$100.00", "$50.00"), table1.get("due amounts").toObject());

    Area table2 = al.area("second table");
    Assertions.assertEquals(
        List.of("John", "Frank", "Jason", "Tim"), table2.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names").toObject());
    Assertions.assertEquals(
        List.of("$50.00", "$51.00", "$100.00", "$50.00"), table2.get("due amounts").toObject());
  }

  @Test
  void testTableSorting() {
    driver.get(TABLE_URL);

    Area table1 = al.area("first table");
    Assertions.assertEquals(
        List.of("John", "Frank", "Jason", "Tim"), table1.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Smith", "Bach", "Doe", "Conway"), table1.get("last names").toObject());

    Area table2 = al.area("second table");
    Assertions.assertEquals(
        List.of("John", "Frank", "Jason", "Tim"), table2.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names").toObject());

    table1.act("sort by last name");
    Assertions.assertEquals(
        List.of("Frank", "Tim", "Jason", "John"), table1.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names").toObject());

    table2 = al.area("second table");
    Assertions.assertEquals(
        List.of("John", "Frank", "Jason", "Tim"), table2.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names").toObject());

    table2.act("sort by first name");
    Assertions.assertEquals(
        List.of("Frank", "Jason", "John", "Tim"), table2.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Bach", "Doe", "Smith", "Conway"), table2.get("last names").toObject());

    Assertions.assertEquals(
        List.of("Frank", "Tim", "Jason", "John"), table1.get("first names").toObject());
    Assertions.assertEquals(
        List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names").toObject());
  }
}
