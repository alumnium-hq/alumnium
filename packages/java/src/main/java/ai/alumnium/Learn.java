package ai.alumnium;

import ai.alumnium.client.HttpClient;
import ai.alumnium.driver.BaseDriver;
import java.util.List;

/**
 * Teaches Alumnium how to handle instructions. Lessons are persisted for the current app and apply
 * to later sessions.
 */
public class Learn {
  private final HttpClient client;
  private final BaseDriver driver;

  public Learn(HttpClient client, BaseDriver driver) {
    this.client = client;
    this.driver = driver;
  }

  /**
   * Teaches the actions to perform to achieve the goal with {@link Alumni#act(String)}.
   *
   * @param goal Goal in the same format as in {@link Alumni#act(String)}.
   * @param actions Actions to achieve the goal.
   */
  public void act(String goal, List<String> actions) {
    client.addExample(goal, actions == null ? List.of() : List.copyOf(actions), driver.app());
  }

  /**
   * Teaches how to retrieve the data with {@link Alumni#get(String)}.
   *
   * @param data Data in the same format as in {@link Alumni#get(String)}.
   * @param hint How to retrieve it, e.g. which element holds it.
   */
  public void get(String data, String hint) {
    client.addHint("get", data, hint, driver.app());
  }

  /**
   * Teaches how to verify the statement with {@link Alumni#check(String)}.
   *
   * @param statement Statement in the same format as in {@link Alumni#check(String)}.
   * @param hint How to verify it, e.g. what makes it true.
   */
  public void check(String statement, String hint) {
    client.addHint("check", statement, hint, driver.app());
  }

  /**
   * Teaches how to locate the element with {@link Alumni#find(String)}.
   *
   * @param description Description in the same format as in {@link Alumni#find(String)}.
   * @param hint How to locate it, e.g. its role and name.
   */
  public void find(String description, String hint) {
    client.addHint("find", description, hint, driver.app());
  }

  /**
   * Teaches how to identify the area with {@link Alumni#area(String)}.
   *
   * @param description Description in the same format as in {@link Alumni#area(String)}.
   * @param hint How to identify it, e.g. its container and heading.
   */
  public void area(String description, String hint) {
    client.addHint("area", description, hint, driver.app());
  }
}
