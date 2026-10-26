package ai.alumnium.driver.selenium;

import ai.alumnium.accessibility.AriaAccessibilityTree;
import ai.alumnium.driver.SeleniumDriver;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.openqa.selenium.HasCapabilities;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.bidi.BiDi;
import org.openqa.selenium.bidi.Command;
import org.openqa.selenium.bidi.Event;
import org.openqa.selenium.bidi.HasBiDi;
import org.openqa.selenium.json.Json;
import org.openqa.selenium.remote.Augmenter;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.openqa.selenium.remote.RemoteWebElement;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Selenium driver for Firefox (WebDriver BiDi). Builds accessibility trees with acquiescence over
 * WebDriver BiDi instead of CDP, and locates elements by BiDi shared IDs, which Firefox accepts as
 * WebDriver element references.
 *
 * <p>Requires BiDi to be enabled ({@code FirefoxOptions#enableBiDi()}). Frames and shadow DOM are
 * not supported yet.
 */
public final class BiDiDriver extends SeleniumDriver {

  private static final Logger LOG = LoggerFactory.getLogger(BiDiDriver.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static final String SANDBOX = "alumnium";

  private static final String ACQUIESCENCE_FUNCTION =
      "() => {\n"
          + loadScript("/ai/alumnium/driver/scripts/acquiescence.js")
          + "\nglobalThis.Acquiescence = Acquiescence;\n}";

  private static final String SNAPSHOT_FUNCTION =
      loadScript("/ai/alumnium/driver/scripts/ariaSnapshot.js");

  private static final long NAVIGATION_START_TIMEOUT_MS = 250;
  private static final long NAVIGATION_LOAD_TIMEOUT_MS = 10_000;
  private static final long NAVIGATION_POLL_INTERVAL_MS = 50;

  private static final String CONTEXT_CREATED_EVENT = "browsingContext.contextCreated";
  private static final String CONTEXT_DESTROYED_EVENT = "browsingContext.contextDestroyed";
  private static final String NAVIGATION_STARTED_EVENT = "browsingContext.navigationStarted";
  private static final List<String> NAVIGATION_FINISHED_EVENTS =
      List.of(
          "browsingContext.load",
          "browsingContext.navigationAborted",
          "browsingContext.navigationFailed");

  private final Object navigationLock = new Object();
  private boolean trackingNavigation = false;
  private long navigationStartDeadline = 0;
  // Navigation (or context, when the event has no navigation) -> its context.
  private final Map<String, String> startedNavigations = new HashMap<>();
  private final Set<String> finishedNavigations = new HashSet<>();
  private final Set<String> destroyedContexts = new HashSet<>();

  private BiDi bidi;

  public BiDiDriver(WebDriver driver) {
    super(driver);
    initPageScripts();
  }

  @Override
  public String platform() {
    return "firefox";
  }

  @Override
  protected AriaAccessibilityTree fetchAccessibilityTree() {
    driver.switchTo().defaultContent();
    // A new tab might take the foreground and leave the current one hidden.
    String context = driver.getWindowHandle();
    driver.switchTo().window(context);

    waitForPageToLoad();

    Map<String, Object> result = callInSandbox(context, SNAPSHOT_FUNCTION);
    if ("null".equals(result.get("type"))) {
      LOG.debug("Acquiescence is not preloaded, loading it into the page");
      callInSandbox(context, ACQUIESCENCE_FUNCTION);
      result = callInSandbox(context, SNAPSHOT_FUNCTION);
    }

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> value = (List<Map<String, Object>>) result.get("value");
    Map<String, Object> snapshot;
    try {
      snapshot =
          MAPPER.readValue(
              String.valueOf(value.get(0).get("value")),
              new TypeReference<Map<String, Object>>() {});
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Failed to parse accessibility snapshot", e);
    }
    @SuppressWarnings("unchecked")
    List<String> refs = (List<String>) snapshot.get("refs");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> elements = (List<Map<String, Object>>) value.get(1).get("value");

    Map<String, String> sharedIds = new LinkedHashMap<>();
    for (int i = 0; i < refs.size() && i < elements.size(); i++) {
      Object sharedId = elements.get(i).get("sharedId");
      if (sharedId != null) {
        sharedIds.put(refs.get(i), sharedId.toString());
      }
    }
    LOG.debug("Accessibility snapshot has {} referenced nodes", refs.size());

    @SuppressWarnings("unchecked")
    Map<String, Object> root = (Map<String, Object>) snapshot.get("root");
    @SuppressWarnings("unchecked")
    Map<String, String> values = (Map<String, String>) snapshot.get("values");
    return new AriaAccessibilityTree(root, sharedIds, values);
  }

  // region Actions

  @Override
  public WebElement findElement(int id) {
    String sharedId = accessibilityTree().elementById(id).sharedId();
    if (sharedId == null) {
      throw new IllegalStateException("Element with raw_id=" + id + " has no shared ID");
    }
    if (!(driver instanceof RemoteWebDriver remoteDriver)) {
      throw new IllegalStateException("BiDiDriver requires a RemoteWebDriver");
    }

    // Snapshots only cover the top-level document.
    driver.switchTo().defaultContent();
    RemoteWebElement element = new RemoteWebElement();
    element.setParent(remoteDriver);
    element.setId(sharedId);
    element.setFileDetector(remoteDriver.getFileDetector());
    return element;
  }

  @Override
  public String screenshot() {
    if (!fullPageScreenshot) {
      return ((TakesScreenshot) driver).getScreenshotAs(OutputType.BASE64);
    }

    Map<String, Object> result =
        sendBiDiCommand(
            "browsingContext.captureScreenshot",
            Map.of("context", driver.getWindowHandle(), "origin", "document"));
    return String.valueOf(result.get("data"));
  }

  @Override
  public void printToPdf(String filepath) {
    Map<String, Object> result =
        sendBiDiCommand("browsingContext.print", Map.of("context", driver.getWindowHandle()));
    try {
      Files.write(
          Path.of(filepath), Base64.getDecoder().decode(String.valueOf(result.get("data"))));
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Failed to write PDF to " + filepath, e);
    }
  }

  // endregion
  // region Internals

  /**
   * GeckoDriver doesn't wait for navigations started by actions. Same-document navigations aren't
   * waited for.
   */
  @Override
  protected void withNavigationWait(Runnable action) {
    synchronized (navigationLock) {
      trackingNavigation = true;
      navigationStartDeadline = 0;
      startedNavigations.clear();
      finishedNavigations.clear();
      destroyedContexts.clear();
    }

    try {
      action.run();

      // Navigations are given a moment to start after the action, extended for
      // new tabs, which start blank and only navigate after being created.
      long now = System.currentTimeMillis();
      long loadDeadline = now + NAVIGATION_LOAD_TIMEOUT_MS;
      synchronized (navigationLock) {
        navigationStartDeadline =
            Math.max(navigationStartDeadline, now + NAVIGATION_START_TIMEOUT_MS);
      }

      while (true) {
        int pending;
        long startDeadline;
        synchronized (navigationLock) {
          pending = pendingNavigations();
          startDeadline = navigationStartDeadline;
        }
        if (pending == 0 && System.currentTimeMillis() >= startDeadline) break;
        if (System.currentTimeMillis() > loadDeadline) {
          LOG.warn("Timed out waiting for navigation to load in {} tab(s)", pending);
          break;
        }
        try {
          Thread.sleep(NAVIGATION_POLL_INTERVAL_MS);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          break;
        }
      }
    } finally {
      synchronized (navigationLock) {
        trackingNavigation = false;
      }
    }
  }

  int pendingNavigations() {
    synchronized (navigationLock) {
      Set<String> contexts = new HashSet<>();
      for (Map.Entry<String, String> entry : startedNavigations.entrySet()) {
        if (!finishedNavigations.contains(entry.getKey())
            && !destroyedContexts.contains(entry.getValue())) {
          contexts.add(entry.getValue());
        }
      }
      return contexts.size();
    }
  }

  void onNavigationEvent(String method, Map<String, Object> params) {
    // Selenium runs callbacks in a thread pool, so events may be handled out of
    // order. Navigations are therefore tracked by ID rather than by adding and
    // removing contexts.
    String context = String.valueOf(params.getOrDefault("context", ""));
    Object navigationId = params.get("navigation");
    String navigation = navigationId == null ? context : navigationId.toString();
    synchronized (navigationLock) {
      if (!trackingNavigation) return;
      if (method.equals(CONTEXT_CREATED_EVENT)) {
        navigationStartDeadline =
            Math.max(
                navigationStartDeadline, System.currentTimeMillis() + NAVIGATION_START_TIMEOUT_MS);
      } else if (method.equals(CONTEXT_DESTROYED_EVENT)) {
        destroyedContexts.add(context);
      } else if (method.equals(NAVIGATION_STARTED_EVENT)) {
        startedNavigations.put(navigation, context);
      } else if (NAVIGATION_FINISHED_EVENTS.contains(method)) {
        finishedNavigations.add(navigation);
      }
    }
  }

  @Override
  protected void initPageScripts() {
    // Installed first, as the waiter must be in place before pages load.
    try {
      sendBiDiCommand(
          "script.addPreloadScript",
          Map.of("functionDeclaration", "() => {\n" + WAITER_SCRIPT + "\n}"));
    } catch (RuntimeException e) {
      LOG.debug("Could not install waiter script through BiDi", e);
    }

    List<String> events = new java.util.ArrayList<>();
    events.add(CONTEXT_CREATED_EVENT);
    events.add(CONTEXT_DESTROYED_EVENT);
    events.add(NAVIGATION_STARTED_EVENT);
    events.addAll(NAVIGATION_FINISHED_EVENTS);
    for (String event : events) {
      try {
        // Subscribes to the event as well.
        bidi()
            .addListener(
                new Event<Map<String, Object>>(event, params -> params),
                params -> onNavigationEvent(event, params));
      } catch (RuntimeException e) {
        LOG.debug("Could not subscribe to {} through BiDi", event, e);
      }
    }

    try {
      sendBiDiCommand(
          "script.addPreloadScript",
          Map.of("functionDeclaration", ACQUIESCENCE_FUNCTION, "sandbox", SANDBOX));
    } catch (RuntimeException e) {
      LOG.debug("Could not preload acquiescence through BiDi", e);
    }
  }

  private Map<String, Object> callInSandbox(String context, String functionDeclaration) {
    Map<String, Object> response =
        sendBiDiCommand(
            "script.callFunction",
            Map.of(
                "functionDeclaration",
                functionDeclaration,
                "awaitPromise",
                false,
                "target",
                Map.of("context", context, "sandbox", SANDBOX),
                "resultOwnership",
                "none",
                "serializationOptions",
                Map.of("maxDomDepth", 0)));

    Object result = response.get("result");
    if ("exception".equals(response.get("type")) || !(result instanceof Map<?, ?>)) {
      Object details =
          response.get("exceptionDetails") instanceof Map<?, ?> exceptionDetails
              ? exceptionDetails.get("text")
              : null;
      throw new IllegalStateException(
          "Failed to take accessibility snapshot: "
              + (details == null ? "unknown error" : details));
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> typed = (Map<String, Object>) result;
    return typed;
  }

  private Map<String, Object> sendBiDiCommand(String method, Map<String, Object> params) {
    Map<String, Object> result =
        bidi()
            .send(
                new Command<Map<String, Object>>(
                    method, params, input -> input.read(Json.MAP_TYPE)));
    return result == null ? Map.of() : result;
  }

  private BiDi bidi() {
    if (bidi != null) return bidi;

    if (!(driver instanceof HasCapabilities hasCapabilities)
        || hasCapabilities.getCapabilities().getCapability("webSocketUrl") == null) {
      throw new IllegalStateException(
          "Firefox support requires WebDriver BiDi, enable it with"
              + " `new FirefoxOptions().enableBiDi()`");
    }

    WebDriver withBiDi = driver instanceof HasBiDi ? driver : new Augmenter().augment(driver);
    bidi = ((HasBiDi) withBiDi).getBiDi();
    return bidi;
  }

  // endregion
}
