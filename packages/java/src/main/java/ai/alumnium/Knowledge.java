package ai.alumnium;

import ai.alumnium.client.HttpClient;
import ai.alumnium.driver.BaseDriver;
import java.util.List;

/**
 * Teaches Alumnium how to handle instructions, e.g. {@code al.knowledge().act(goal, actions)}.
 * Lessons go to the product layer of the knowledge scope of the app the driver is on; {@link
 * #on(String)} and {@link #shared()} pick another layer and {@link #app(String)} another app. They
 * apply to the session, and to later sessions when {@code ALUMNIUM_KNOWLEDGE} is enabled.
 */
public class Knowledge {
  private final HttpClient client;
  private final BaseDriver driver;
  private final String layer;
  private final String app;

  public Knowledge(HttpClient client, BaseDriver driver) {
    this(client, driver, "product");
  }

  public Knowledge(HttpClient client, BaseDriver driver, String layer) {
    this(client, driver, layer, null);
  }

  /**
   * @param app App the lessons are for, {@code null} for the app the driver is on.
   */
  public Knowledge(HttpClient client, BaseDriver driver, String layer, String app) {
    this.client = client;
    this.driver = driver;
    this.layer = layer;
    this.app = app;
  }

  /**
   * Teaches the actions to perform to achieve the goal with {@link Alumni#act(String)}.
   *
   * @param goal Goal in the same format as in {@link Alumni#act(String)}.
   * @param actions Actions to achieve the goal.
   */
  public void act(String goal, List<String> actions) {
    client.addExample(goal, actions == null ? List.of() : List.copyOf(actions), appId(), layer);
  }

  /**
   * Teaches how to retrieve the data with {@link Alumni#get(String)}.
   *
   * @param data Data in the same format as in {@link Alumni#get(String)}.
   * @param hint How to retrieve it, e.g. which element holds it.
   */
  public void get(String data, String hint) {
    client.addHint("get", data, hint, appId(), layer);
  }

  /**
   * Teaches how to verify the statement with {@link Alumni#check(String)}.
   *
   * @param statement Statement in the same format as in {@link Alumni#check(String)}.
   * @param hint How to verify it, e.g. what makes it true.
   */
  public void check(String statement, String hint) {
    client.addHint("check", statement, hint, appId(), layer);
  }

  /**
   * Teaches how to locate the element with {@link Alumni#find(String)}.
   *
   * @param description Description in the same format as in {@link Alumni#find(String)}.
   * @param hint How to locate it, e.g. its role and name.
   */
  public void find(String description, String hint) {
    client.addHint("find", description, hint, appId(), layer);
  }

  /**
   * Teaches how to identify the area with {@link Alumni#area(String)}.
   *
   * @param description Description in the same format as in {@link Alumni#area(String)}.
   * @param hint How to identify it, e.g. its container and heading.
   */
  public void area(String description, String hint) {
    client.addHint("area", description, hint, appId(), layer);
  }

  /**
   * Teaches lessons for one platform of the product.
   *
   * @param platform Platform the lessons apply to: {@code "web"}, {@code "ios"} or {@code
   *     "android"}.
   */
  public Knowledge on(String platform) {
    return new Knowledge(client, driver, platform, app);
  }

  /** Teaches lessons shared by all products. */
  public Knowledge shared() {
    return new Knowledge(client, driver, "shared", app);
  }

  /**
   * Teaches lessons for the app rather than the one the driver is on, e.g. before navigating to it.
   * The knowledge manifest maps it to its product like any other app.
   *
   * @param app App ID, host or URL as drivers report it, e.g. {@code "example.com"} or {@code
   *     "com.example.app"}.
   */
  public Knowledge app(String app) {
    return new Knowledge(client, driver, layer, app);
  }

  /**
   * Forgets the lesson for the instruction in this layer, learned in this or an earlier session.
   *
   * @param kind Kind of lesson: {@code "do"}, {@code "get"}, {@code "check"}, {@code "find"} or
   *     {@code "area"}.
   * @param instruction Instruction the lesson was learned for.
   * @return Whether a lesson was forgotten.
   */
  public boolean forget(String kind, String instruction) {
    return client.forgetLesson(kind, instruction, appId(), layer);
  }

  /**
   * Deletes every persisted lesson in this layer of the knowledge scope, so no later session uses
   * them, along with the ones taught in this session.
   */
  public void purge() {
    client.clearLayer(appId(), layer);
  }

  private String appId() {
    return app != null ? app : driver.app();
  }
}
