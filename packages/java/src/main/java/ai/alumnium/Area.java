package ai.alumnium;

import ai.alumnium.Alumni.CheckOptions;
import ai.alumnium.Alumni.GetOptions;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.client.Data;
import ai.alumnium.client.FindElementResult;
import ai.alumnium.client.HttpClient;
import ai.alumnium.client.HttpClient.ActionResult;
import ai.alumnium.client.HttpClient.PlanResult;
import ai.alumnium.driver.BaseDriver;
import ai.alumnium.result.DoResult;
import ai.alumnium.result.DoStep;
import ai.alumnium.tool.BaseTool;
import ai.alumnium.util.Retry;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Area {
  private final int id;
  private final String description;
  private final BaseDriver driver;
  private final BaseAccessibilityTree accessibilityTree;
  private final Map<String, Class<? extends BaseTool>> tools;
  private final HttpClient client;

  public Area(
      int id,
      String description,
      BaseDriver driver,
      BaseAccessibilityTree accessibilityTree,
      Map<String, Class<? extends BaseTool>> tools,
      HttpClient client) {
    this.id = id;
    this.description = description;
    this.driver = driver;
    this.accessibilityTree = accessibilityTree;
    this.tools = tools;
    this.client = client;
  }

  public int id() {
    return id;
  }

  public String description() {
    return description;
  }

  public BaseDriver driver() {
    return driver;
  }

  public BaseAccessibilityTree accessibilityTree() {
    return accessibilityTree;
  }

  public Map<String, Class<? extends BaseTool>> tools() {
    return tools;
  }

  public HttpClient client() {
    return client;
  }

  /**
   * Act on the area.
   *
   * @param goal the goal to act on
   * @return the result of the action (explanation and executed steps)
   */
  public DoResult act(String goal) {
    return Retry.execute(
        () -> {
          driver.setAccessibilityTree(accessibilityTree);

          PlanResult response = client.planActions(goal, accessibilityTree.toStr(), driver.app());
          String explanation = response.explanation();
          List<String> steps = response.steps();
          List<DoStep> executedSteps = new ArrayList<>();
          for (String step : steps) {
            ActionResult actionResult =
                client.executeAction(goal, step, accessibilityTree.toStr(), driver.app());

            if (explanation.equals(goal)) {
              explanation = actionResult.explanation();
            }

            List<String> calledTools = new ArrayList<>();
            for (DoStep toolCall : actionResult.actions()) {
              calledTools.add(BaseTool.executeToolCall(toolCall, tools, driver));
            }
            executedSteps.add(new DoStep(step, calledTools));
          }
          return new DoResult(explanation, executedSteps);
        });
  }

  /**
   * Check a statement true or false within the area.
   *
   * @param statement the statement to check
   * @return the result of the check
   */
  public String check(String statement) {
    return check(statement, new CheckOptions(false));
  }

  /**
   * Check a statement true or false within the area.
   *
   * @param statement the statement to check
   * @param opts the options for the check
   * @return the result of the check
   */
  public String check(String statement, CheckOptions opts) {
    return Retry.execute(
        () -> {
          boolean vision = opts != null && opts.vision();
          HttpClient.RetrieveResult result =
              client.retrieve(
                  "Is the following true or false - " + statement,
                  accessibilityTree.toStr(),
                  driver.title(),
                  driver.url(),
                  vision ? driver.screenshot() : null,
                  driver.app());

          if (!Boolean.TRUE.equals(result.result().boxedValue())) {
            throw new AssertionError(result.explanation());
          }
          return result.explanation();
        });
  }

  /**
   * Get data from the area.
   *
   * @param data the data to get
   * @return the data
   */
  public Object get(String data) {
    return get(data, new GetOptions(false));
  }

  /**
   * Get data from the area.
   *
   * @param data the data to get
   * @param opts the options for the get
   * @return the data
   */
  public Object get(String data, GetOptions opts) {
    return Retry.execute(
        () -> {
          boolean vision = opts != null && opts.vision();
          HttpClient.RetrieveResult result =
              client.retrieve(
                  data,
                  accessibilityTree.toStr(),
                  driver.title(),
                  driver.url(),
                  vision ? driver.screenshot() : null,
                  driver.app());

          Data value = result.result();
          if (value == null || value.isNoop()) {
            return new Data.StringData(result.explanation());
          }
          return value.toObject();
        });
  }

  /**
   * Find an element in the area.
   *
   * @param description Natural language description of the element to find.
   * @return Native driver element (Selenium WebElement, Playwright Locator, or Appium WebElement).
   */
  public Object find(String description) {
    return Retry.execute(
        () -> {
          driver.setAccessibilityTree(accessibilityTree);
          FindElementResult response =
              client.findElement(description, accessibilityTree.toStr(), driver.app());
          return driver.findElement(response.id());
        });
  }
}
