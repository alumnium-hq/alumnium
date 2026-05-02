package ai.alumnium.driver;

import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.driver.locators.Element;
import ai.alumnium.tool.BaseTool;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

/**
 * Abstract surface every driver flavour must provide.
 *
 * <p>Sealed on the three supported backends - Selenium, Playwright, Appium -
 * so that {@code switch} pattern matching on {@code BaseDriver} is
 * exhaustive.
 */

public abstract sealed class BaseDriver
    permits SeleniumDriver, PlaywrightDriver, AppiumDriver {
    
    public abstract String platform();

    /** Full accessibility tree snapshot for the current view. */
    public abstract BaseAccessibilityTree accessibilityTree();

    public abstract Set<Class<? extends BaseTool>> supportedTools();

    public abstract void click(int id);
    public abstract void dragSlider(int id, double value);
    public abstract void dragAndDrop(int fromId, int toId);
    public abstract void pressKey(Key key);
    public abstract void quit();
    public abstract void back();
    public abstract void visit(String url);
    public abstract String screenshot();
    public abstract void scrollTo(int id);
    public abstract String title();
    public abstract void type(int id, String text);
    public abstract String url();
    public abstract String app();
    public abstract Element findElement(int id);
    public abstract void executeScript(String script);
    public abstract void switchToNextTab();
    public abstract void switchToPreviousTab();
    public abstract void printToPdf(String filepath);

    /** Hover is only meaningful for web drivers; mobile throws by default. */
    public void hover(int id) {
        throw new UnsupportedOperationException("hover is not supported by " + platform());
    }

    /** File upload is only meaningful for web drivers; mobile throws by default. */
    public void upload(int id, List<String> paths) {
        throw new UnsupportedOperationException("upload is not supported by " + platform());
    }

    /** Loads a classpath-shipped script (e.g. waiter.js) as a UTF-8 string. */
    protected static String loadScript(String resourcePath) {
        try (InputStream in = BaseDriver.class.getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException("Missing driver script resource: " + resourcePath);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read driver script resource: " + resourcePath, e);
        }
    }
}