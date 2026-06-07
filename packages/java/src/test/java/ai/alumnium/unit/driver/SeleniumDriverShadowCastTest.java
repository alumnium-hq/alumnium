package ai.alumnium.unit.driver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

import ai.alumnium.driver.SeleniumDriver;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chromium.HasCdp;

/**
 * Verifies that SeleniumDriver.getShadowChildNodes handles non-Long numeric nodeId values (e.g.,
 * Integer) returned by CDP and correctly looks up backendDOMNodeId.
 */
public class SeleniumDriverShadowCastTest {

  @Test
  void handlesIntegerNodeIdFromCdp() throws Exception {
    // Create a mock WebDriver that also implements HasCdp
    WebDriver webDriver = mock(WebDriver.class, withSettings().extraInterfaces(HasCdp.class));
    HasCdp cdp = (HasCdp) webDriver;

    // Stub CDP calls made in constructor and method under test
    when(cdp.executeCdpCommand(eq("Target.setAutoAttach"), any(Map.class))).thenReturn(Map.of());

    // Accessibility.queryAXTree will return nodes where nodeId is an Integer
    Map<String, Object> axNode = new HashMap<>();
    axNode.put("nodeId", Integer.valueOf(42)); // intentionally Integer, not Long
    axNode.put("backendDOMNodeId", null);
    axNode.put("childIds", new ArrayList<>()); // no children

    Map<String, Object> queryAxTreeResp = new HashMap<>();
    queryAxTreeResp.put("nodes", List.of(axNode));

    when(cdp.executeCdpCommand(eq("Accessibility.queryAXTree"), any(Map.class)))
        .thenReturn(queryAxTreeResp);

    // Construct driver
    SeleniumDriver driver = new SeleniumDriver(webDriver);

    // Prepare inputs to private getShadowChildNodes(Long, Set<String>, Map<Long, Long>)
    Long rootNodeId = 42L;
    Set<String> processed = new HashSet<>();
    Map<Long, Long> nodeIdToBackendId = new HashMap<>();
    nodeIdToBackendId.put(42L, 999L);

    // Invoke private method via reflection
    Method m =
        SeleniumDriver.class.getDeclaredMethod(
            "getShadowChildNodes", Long.class, Set.class, Map.class);
    m.setAccessible(true);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> out =
        (List<Map<String, Object>>) m.invoke(driver, rootNodeId, processed, nodeIdToBackendId);

    assertThat(out).hasSize(1);
    Map<String, Object> returned = out.get(0);
    assertThat(returned.get("backendDOMNodeId")).isEqualTo(999L);
    assertThat(returned.get("_is_shadow_dom")).isEqualTo(true);
  }
}
