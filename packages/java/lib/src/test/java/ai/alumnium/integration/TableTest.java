package ai.alumnium.integration;

import ai.alumnium.Alumni;
import ai.alumnium.Model;
import ai.alumnium.Provider;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assertions;
import org.openqa.selenium.chrome.ChromeDriver;
import java.util.List;

import ai.alumnium.Area;

public class TableTest {
    private static final String TABLE_URL = "https://the-internet.herokuapp.com/tables";
    private static final Model MODEL = new Model(Provider.ANTHROPIC, "claude-haiku-4-5-20251001");
    private static Alumni al;
    private static ChromeDriver driver;
    
    @BeforeAll
    static void learn() {
        Alumni.Options options = new Alumni.Options()
            .withUrl("http://127.0.0.1:8013")
            .withModel(MODEL)
            .withPlanner(true)
            .withChangeAnalysis(true);

        driver = new ChromeDriver();
        al = new Alumni(driver, options);
    }

    @Test
    void testTableExtraction() {
        driver.get(TABLE_URL);
        
        Area table1 = al.area("first table");
        Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table1.get("first names").toObject());
        Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table1.get("last names").toObject());
        Assertions.assertEquals(List.of("$50.00", "$51.00", "$100.00", "$50.00"), table1.get("due amounts").toObject());

        Area table2 = al.area("second table");
        Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names").toObject());
        Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names").toObject());
        Assertions.assertEquals(List.of("$50.00", "$51.00", "$100.00", "$50.00"), table2.get("due amounts").toObject());
    }

    @Test
    void testTableSorting() {
        driver.get(TABLE_URL);
        
        Area table1 = al.area("first table");
        Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table1.get("first names").toObject());
        Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table1.get("last names").toObject());

        Area table2 = al.area("second table");
        Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names").toObject());
        Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names").toObject());

        table1.act("sort by last name");
        Assertions.assertEquals(List.of("Frank", "Tim", "Jason", "John"), table1.get("first names").toObject());
        Assertions.assertEquals(List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names").toObject());

        table2 = al.area("second table");
        Assertions.assertEquals(List.of("John", "Frank", "Jason", "Tim"), table2.get("first names").toObject());
        Assertions.assertEquals(List.of("Smith", "Bach", "Doe", "Conway"), table2.get("last names").toObject());

        table2.act("sort by first name");
        Assertions.assertEquals(List.of("Frank", "Jason", "John", "Tim"), table2.get("first names").toObject());
        Assertions.assertEquals(List.of("Bach", "Doe", "Smith", "Conway"), table2.get("last names").toObject());

        Assertions.assertEquals(List.of("Frank", "Tim", "Jason", "John"), table1.get("first names").toObject());
        Assertions.assertEquals(List.of("Bach", "Conway", "Doe", "Smith"), table1.get("last names").toObject());
    }

    @AfterAll
    static void tearDown() {
        al.close();
    }
}
