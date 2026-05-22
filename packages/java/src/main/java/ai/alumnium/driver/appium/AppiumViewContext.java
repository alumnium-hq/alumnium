package ai.alumnium.driver.appium;

import ai.alumnium.driver.AppiumDriver.Platform;

/** Shared state passed into every {@link AppiumViewStrategy} implementation. */
public record AppiumViewContext(
    io.appium.java_client.AppiumDriver driver,
    Platform platform,
    boolean autoswitchContexts,
    boolean hideKeyboardAfterTyping,
    boolean doubleFetchPageSource,
    double delay) {}
