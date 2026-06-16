package ai.alumnium.system;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium-android")
public class LocatorTest extends BaseTest {

  private static final String FORM_URL =
      "https://bonigarcia.dev/selenium-webdriver-java/web-form.html";

  @Test
  void testFindsElements() {
    navigate(FORM_URL);

    Object textInput = al.find("text input");
    Assertions.assertNotNull(textInput);
    type(textInput, "Hello Alumnium!");

    Object textarea = al.find("textarea");
    Assertions.assertNotNull(textarea);
    type(textarea, "Testing the LocatorAgent");

    Object submitButton = al.find("submit button");
    Assertions.assertNotNull(submitButton);
    click(submitButton);
  }
}
