package ai.alumnium.integration;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.chrome.ChromeDriver;

import java.util.List;

import ai.alumnium.Alumni;
import ai.alumnium.Model;
import ai.alumnium.Provider;

public class CalculatorTest {

    private static final String CALCULATOR_URL = "https://seleniumbase.io/apps/calculator";
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
        al.learn("2 + 2 =", 
        List.of(
            "click button '2'",
            "click button '+'",
            "click button '2'",
            "click button '='"));
    }

    @Test
    void testAddition() {
        driver.get(CALCULATOR_URL);
        al.act("2 + 2 =");
        al.check("calculator result from textfield equals 4");
    }

    @Test
    void testSubtraction() {
        driver.get(CALCULATOR_URL);
        al.act("5 - 3 =");
        al.check("calculator result from textfield equals 2");
    }

    @Test
    void testMultiplication() {
        driver.get(CALCULATOR_URL);
        al.act("3 * 4 =");
        al.check("calculator result from textfield equals 12");
    }

    @Test
    void testDivision() {
        driver.get(CALCULATOR_URL);
        al.act("8 / 2 =");
        al.check("calculator result from textfield equals 4");
    }
}
