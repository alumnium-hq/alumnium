package ai.alumnium;

import ai.alumnium.client.HttpClient;
import ai.alumnium.driver.BaseDriver;

/**
 * The same as {@link Knowledge}.
 *
 * @deprecated Use {@link Alumni#knowledge()} and {@link Knowledge} instead.
 */
@Deprecated
public class Learn extends Knowledge {
  public Learn(HttpClient client, BaseDriver driver) {
    super(client, driver);
  }

  public Learn(HttpClient client, BaseDriver driver, String layer) {
    super(client, driver, layer);
  }
}
