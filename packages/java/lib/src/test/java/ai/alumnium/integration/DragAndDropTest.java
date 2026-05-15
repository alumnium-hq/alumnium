package ai.alumnium.integration;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.chrome.ChromeDriver;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.AfterAll;

import java.util.List;

import ai.alumnium.Alumni;
import ai.alumnium.Model;
import ai.alumnium.Provider;
import ai.alumnium.client.Data;

public class DragAndDropTest {

    private static final String DRAG_AND_DROP_URL = "https://the-internet.herokuapp.com/drag_and_drop";
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
    void testDragAndDrop() {
        driver.get(DRAG_AND_DROP_URL);
        Data data = al.get("titles of squares ordered from left to right", new Alumni.VisionOptions(true));
        Assertions.assertEquals(List.of("A", "B"), listFromGet(data));

        al.act("move square A to square B");

        data = al.get("titles of squares ordered from left to right", new Alumni.VisionOptions(true));
        Assertions.assertEquals(List.of("B", "A"), listFromGet(data));
    }

    @AfterAll
    static void tearDown() {
        al.close();
    }

    private static List<String> listFromGet(Data data) {
        Object raw = data.toObject();
        Assertions.assertInstanceOf(
            List.class,
            raw,
            () -> "expected list result, got: " + (raw == null ? "null" : raw));
        List<?> items = (List<?>) raw;
        return items.stream().map(String::valueOf).toList();
    }
}
