package ai.alumnium;

import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.client.Data;
import ai.alumnium.client.HttpClient;
import ai.alumnium.driver.AppiumDriver;
import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.locators.Element;
import ai.alumnium.driver.PlaywrightDriver;
import ai.alumnium.driver.SeleniumDriver;
import ai.alumnium.result.DoResult;
import ai.alumnium.result.DoStep;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.tool.ToolToSchemaConverter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Public entry point for the Java client. 
 *
 * <p>Driver selection uses exhaustive {@code switch} pattern matching on the
 * supplied native driver object. Supported driver types:
 * <ul>
 *   <li>{@link io.appium.java_client.AppiumDriver} &rarr; {@link AppiumDriver}</li>
 *   <li>{@link com.microsoft.playwright.Page} &rarr; {@link PlaywrightDriver}</li>
 *   <li>{@link org.openqa.selenium.WebDriver} &rarr; {@link SeleniumDriver}</li>
 * </ul>
 */
public final class Alumni implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(Alumni.class);

    private final BaseDriver driver;
    private final Model model;
    private final HttpClient client;
    private final Map<String, Class<? extends BaseTool>> tools;
    private final boolean changeAnalysis;

    public Alumni(Object driver) {
        this(driver, new Options());
    }

    public Alumni(Object driver, Options options) {
        Options opts = options == null ? new Options() : options;
        boolean planner = opts.planner() != null ? opts.planner() : Config.PLANNER;
        this.changeAnalysis = opts.changeAnalysis() != null ? opts.changeAnalysis() : Config.CHANGE_ANALYSIS;
        Set<String> excludeAttributes = opts.excludeAttributes() != null
            ? opts.excludeAttributes() : Config.EXCLUDE_ATTRIBUTES;
        this.model = opts.model() != null ? opts.model() : Model.current();
        this.driver = wrapDriver(driver);

        LOG.info("Using model: {}/{}", this.model.provider().value(), this.model.name());

        Map<String, Class<? extends BaseTool>> builtTools = new LinkedHashMap<>();
        for (Class<? extends BaseTool> tool : this.driver.supportedTools()) {
            builtTools.put(tool.getSimpleName(), tool);
        }
        if (opts.extraTools() != null) {
            for (Class<? extends BaseTool> tool : opts.extraTools()) {
                builtTools.put(tool.getSimpleName(), tool);
            }
        }
        this.tools = Collections.unmodifiableMap(builtTools);

        String serverUrl = opts.url() != null ? opts.url() : Config.SERVER_URL;
        if (serverUrl != null) {
            LOG.info("Using HTTP client with server: {}", serverUrl);
        } else {
            LOG.info("Using HTTP client with auto-managed local server");
        }

        List<Map<String, Object>> toolSchemas = ToolToSchemaConverter.convertAll(this.tools);

        this.client = new HttpClient(
            serverUrl,
            this.model,
            this.driver.platform(),
            toolSchemas,
            planner,
            excludeAttributes);
    }

    // ---------------------------------------------------------------
    // Public accessors

    public BaseDriver driver() { return driver; }
    public HttpClient client() { return client; }
    public Model model() { return model; }
    public Map<String, Class<? extends BaseTool>> tools() { return tools; }

    // ---------------------------------------------------------------
    // Actions

    /**
     * Executes a series of steps to achieve the given goal. Named
     * {@code doGoal} because {@code do} is a reserved word in Java.
     */
    public DoResult doGoal(String goal) {
        return executeDo(goal);
    }

    /** Alias for {@link #doGoal(String)} to match the Python {@code do(...)} name. */
    public DoResult perform(String goal) {
        return doGoal(goal);
    }

    /** Assert that the statement is true about the current view. */
    public String check(String statement) {
        return check(statement, new CheckOptions(false));
    }

    public String check(String statement, CheckOptions opts) {
        boolean vision = opts != null && opts.vision();
        HttpClient.RetrieveResult result = client.retrieve(
            "Is the following true or false - " + statement,
            driver.accessibilityTree().toStr(),
            driver.title(),
            driver.url(),
            vision ? driver.screenshot() : null,
            driver.app());
        if (!Boolean.TRUE.equals(result.result().boxedValue())) {
            throw new AssertionError(result.explanation());
        }
        return result.explanation();
    }

    /** Extract data described in natural language from the current view. */
    public Data get(String data) {
        return get(data, new VisionOptions(false));
    }

    public Data get(String data, VisionOptions opts) {
        boolean vision = opts != null && opts.vision();
        HttpClient.RetrieveResult result = client.retrieve(
            data,
            driver.accessibilityTree().toStr(),
            driver.title(),
            driver.url(),
            vision ? driver.screenshot() : null,
            driver.app());
        Data value = result.result();
        if (value == null || value.isNoop()) {
            return new Data.StringData(result.explanation());
        }
        return value;
    }

    /** Resolve a natural-language description to a native driver element. */
    public Element find(String description) {
        Map<String, Object> response = client.findElement(
            description, driver.accessibilityTree().toStr(), driver.app());
        int id = toInt(response.get("id"));
        return driver.findElement(id);
    }

    /** Add a learning example (goal + actions) to the server session. */
    public void learn(String goal, List<String> actions) {
        client.addExample(goal, actions == null ? List.of() : List.copyOf(actions));
    }

    /** Clear all learning examples from the server session. */
    public void clearLearnExamples() {
        client.clearExamples();
    }

    /** Session statistics from the server. */
    public Map<String, Object> stats() {
        return client.stats();
    }

    /** Close the HTTP client/session and the driver. */
    public void quit() {
        try {
            client.quit();
        } finally {
            driver.quit();
        }
    }

    @Override
    public void close() {
        quit();
    }

    // ---------------------------------------------------------------
    // Internals

    private DoResult executeDo(String goal) {
        String app = driver.app();
        BaseAccessibilityTree initial = driver.accessibilityTree();
        String beforeTree = changeAnalysis ? initial.toStr() : null;
        String beforeUrl = changeAnalysis ? driver.url() : null;

        HttpClient.PlanResult plan = client.planActions(goal, initial.toStr(), app);
        String explanation = plan.explanation();

        List<DoStep> executedSteps = new ArrayList<>();
        List<String> steps = plan.steps();
        for (int idx = 0; idx < steps.size(); idx++) {
            String step = steps.get(idx);
            BaseAccessibilityTree tree = idx == 0 ? initial : driver.accessibilityTree();
            HttpClient.ActionResult action = client.executeAction(goal, step, tree.toStr(), app);

            if (explanation.equals(goal)) {
                explanation = action.explanation();
            }

            List<String> calledTools = new ArrayList<>();
            for (Map<String, Object> toolCall : action.actions()) {
                calledTools.add(BaseTool.executeToolCall(toolCall, tools, driver));
            }
            executedSteps.add(new DoStep(step, calledTools));
        }

        String changes = "";
        if (changeAnalysis && !executedSteps.isEmpty()) {
            try {
                changes = client.analyzeChanges(
                    beforeTree,
                    beforeUrl,
                    driver.accessibilityTree().toStr(),
                    driver.url(),
                    app);
            } catch (RuntimeException e) {
                LOG.warn("Error analyzing changes", e);
            }
        }

        return new DoResult(explanation, executedSteps, changes);
    }

    private static BaseDriver wrapDriver(Object driver) {
        if (driver == null) {
            throw new IllegalArgumentException("driver must not be null");
        }
        // Order matters:
        //   - BaseDriver first, so already-wrapped drivers (returned by
        //     Alumni.driver()) pass through unchanged. This lets callers spin
        //     up a secondary Alumni bound to extra tools against the same
        //     underlying driver.
        //   - AppiumDriver before WebDriver, because AppiumDriver extends
        //     RemoteWebDriver (and thus WebDriver).
        return switch (driver) {
            case BaseDriver wrapped -> wrapped;
            case io.appium.java_client.AppiumDriver appium -> new AppiumDriver(appium);
            case com.microsoft.playwright.Page page -> new PlaywrightDriver(page);
            case org.openqa.selenium.WebDriver webDriver -> new SeleniumDriver(webDriver);
            default -> throw new UnsupportedOperationException(
                "Driver " + driver + " not implemented");
        };
    }

    static int toInt(Object raw) {
        if (raw == null) {
            throw new IllegalStateException("Server returned no id");
        }
        if (raw instanceof Number n) return n.intValue();
        String s = raw.toString().trim();
        if (s.isEmpty()) {
            throw new IllegalStateException("Server returned empty id");
        }
        return Integer.parseInt(s);
    }

    // ---------------------------------------------------------------
    // Option records

    /**
     * Construction-time options for {@link Alumni}. Any {@code null} field
     * falls back to the corresponding value from {@link Config} (i.e. the
     * {@code ALUMNIUM_*} environment variables).
     */
    public record Options(
        String url,
        Model model,
        List<Class<? extends BaseTool>> extraTools,
        Boolean planner,
        Boolean changeAnalysis,
        Set<String> excludeAttributes
    ) {
        public Options() {
            this(null, null, List.of(), null, null, null);
        }

        public Options {
            extraTools = extraTools == null ? List.of() : List.copyOf(extraTools);
            if (excludeAttributes != null) {
                excludeAttributes = Collections.unmodifiableSet(new LinkedHashSet<>(excludeAttributes));
            }
        }

        public Options withUrl(String url) {
            return new Options(url, model, extraTools, planner, changeAnalysis, excludeAttributes);
        }
        public Options withModel(Model model) {
            return new Options(url, model, extraTools, planner, changeAnalysis, excludeAttributes);
        }
        public Options withExtraTools(List<Class<? extends BaseTool>> extraTools) {
            return new Options(url, model, extraTools, planner, changeAnalysis, excludeAttributes);
        }
        public Options withPlanner(Boolean planner) {
            return new Options(url, model, extraTools, planner, changeAnalysis, excludeAttributes);
        }
        public Options withChangeAnalysis(Boolean changeAnalysis) {
            return new Options(url, model, extraTools, planner, changeAnalysis, excludeAttributes);
        }
        public Options withExcludeAttributes(Set<String> excludeAttributes) {
            return new Options(url, model, extraTools, planner, changeAnalysis, excludeAttributes);
        }
    }

    /** Vision flag for {@link #get(String, VisionOptions)}. */
    public record VisionOptions(boolean vision) {}

    /** Vision flag for {@link #check(String, CheckOptions)}. */
    public record CheckOptions(boolean vision) {}
}
