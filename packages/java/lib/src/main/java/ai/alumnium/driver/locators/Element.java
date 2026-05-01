package ai.alumnium.driver.locators;

import org.openqa.selenium.WebElement;
import com.microsoft.playwright.Locator;

/**
 * Sealed wrapper over the three native element types returned by the
 * supported drivers. 
 *
 * <p>Consumers typically unwrap the native object through pattern matching:
 * <pre>{@code
 *   String text = switch (element) {
 *       case Element.Selenium(var w)   -> w.getText();
 *       case Element.Playwright(var l) -> l.textContent();
 *       case Element.Appium(var w)     -> w.getText();
 *   };
 * }</pre>
 *
 * <p>Each record's canonical accessor returns the concrete native type via
 * covariant return, so {@code element.raw()} satisfies the interface
 * declaration without explicit overrides.
 */
public sealed interface Element permits Element.Selenium, Element.Playwright, Element.Appium {

    /** The native element, boxed as {@link Object}. */
    Object raw();

    record Selenium(WebElement raw) implements Element {}

    record Playwright(Locator raw) implements Element {}

    record Appium(WebElement raw) implements Element {}
}
