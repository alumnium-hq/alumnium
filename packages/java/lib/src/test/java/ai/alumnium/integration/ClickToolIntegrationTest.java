package ai.alumnium.integration;

import ai.alumnium.Alumni;
import org.openqa.selenium.chrome.ChromeDriver;

import org.junit.jupiter.api.Test;

class ClickToolIntegrationTest {

    @Test
    void openGoogle() {
        ChromeDriver driver = new ChromeDriver();
        Alumni alumni = new Alumni(driver);
        driver.get("https://www.google.com");
        alumni.doGoal("click on Sign In");
        alumni.check("User is not on the home page.");
        alumni.quit();
    }
}
