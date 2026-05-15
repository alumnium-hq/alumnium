package ai.alumnium.integration;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;

public class CalculatorTest extends BaseTest {

    private static final String CALCULATOR_URL = "https://seleniumbase.io/apps/calculator";
    
    @BeforeAll
    static void learn() {   
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
