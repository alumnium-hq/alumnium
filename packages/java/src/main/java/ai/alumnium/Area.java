package ai.alumnium;

import ai.alumnium.Alumni.CheckOptions;
import ai.alumnium.Alumni.VisionOptions;
import ai.alumnium.accessibility.BaseAccessibilityTree;
import ai.alumnium.client.Data;
import ai.alumnium.client.FindElementResult;
import ai.alumnium.client.HttpClient;
import ai.alumnium.client.HttpClient.ActionResult;
import ai.alumnium.client.HttpClient.PlanResult;
import ai.alumnium.driver.BaseDriver;
import ai.alumnium.driver.Element;
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
   * Scope the accessibility tree to the area. Used for all client requests.
   *
   * @return the scoped accessibility tree
   */
  private BaseAccessibilityTree scopedTree() {
    return driver.accessibilityTree().scopeToArea(id);
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
          PlanResult response = client.planActions(goal, scopedTree().toStr(), driver.app());
          String explanation = response.explanation();
          List<String> steps = response.steps();
          List<DoStep> executedSteps = new ArrayList<>();
          for (String step : steps) {
            ActionResult actionResult =
                client.executeAction(goal, step, scopedTree().toStr(), driver.app());

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
                  scopedTree().toStr(),
                  this.driver.title(),
                  this.driver.url(),
                  vision ? this.driver.screenshot() : null,
                  this.driver.app());

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
    return get(data, new VisionOptions(false));
  }

  /**
   * Get data from the area.
   *
   * @param data the data to get
   * @param opts the options for the get
   * @return the data
   */
  public Object get(String data, VisionOptions opts) {
    return Retry.execute(
        () -> {
          boolean vision = opts != null && opts.vision();
          HttpClient.RetrieveResult result =
              client.retrieve(
                  data,
                  scopedTree().toStr(),
                  this.driver.title(),
                  this.driver.url(),
                  vision ? this.driver.screenshot() : null,
                  this.driver.app());

          return result.result().toObject();
        });
  }

  /**
   * Find an element in the area.
   *
   * @param description the description of the element to find
   * @return the element
   */
  public Element find(String description) {
    return Retry.execute(
        () -> {
          FindElementResult response =
              client.findElement(description, scopedTree().toStr(), this.driver.app());
          return this.driver.findElement(response.id());
        });
  }
}
