package ai.alumnium.integration;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.openqa.selenium.chrome.ChromeDriver;

import ai.alumnium.Alumni;
import ai.alumnium.Model;
import ai.alumnium.Provider;

import java.util.List;

public class BaseTest {

    protected static final Model MODEL = new Model(Provider.ANTHROPIC, "claude-haiku-4-5-20251001");
    protected static Alumni al;
    protected static ChromeDriver driver;

    @RegisterExtension
    static final AlumniCacheExtension cacheAfterEach = new AlumniCacheExtension(() -> al);
    
    @BeforeAll
    static void learn() {
        Alumni.Options options = new Alumni.Options()
            .withUrl("http://127.0.0.1:8013")
            .withModel(MODEL)
            .withPlanner(true)
            .withChangeAnalysis(true);

        driver = new ChromeDriver();
        al = new Alumni(driver, options);
        al.learn("2 + 2 =", 
        List.of(
            "click button '2'",
            "click button '+'",
            "click button '2'",
            "click button '='"));
    }

    @AfterAll
    static void tearDown() {
        al.close();
    }
}
