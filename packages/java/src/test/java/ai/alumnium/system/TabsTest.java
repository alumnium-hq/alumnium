package ai.alumnium.system;

import ai.alumnium.driver.PlaywrightDriver;
import ai.alumnium.driver.SeleniumDriver;
import ai.alumnium.tool.SwitchToNextTabTool;
import ai.alumnium.tool.SwitchToPreviousTabTool;
import java.io.File;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;

@DisabledIfEnvironmentVariable(named = "ALUMNIUM_DRIVER", matches = "appium.*")
public class TabsTest extends BaseTest {

  static {
    extraTools = List.of(SwitchToNextTabTool.class, SwitchToPreviousTabTool.class);
  }

  private static final String MULTI_TAB_URL =
      new File("../python/examples/support/pages/multi_tab_page.html").toURI().toString();

  @AfterEach
  void restoreTabs() {
    setAutoswitchToNewTab(true);
    closeExtraTabs();
  }

  @Test
  void testSwitchingTabs() {
    navigate(MULTI_TAB_URL);

    al.act("click on 'Open New Tab' button");
    Assertions.assertEquals("about:blank", al.get("current page URL"));

    al.act("switch to previous browser tab");
    Assertions.assertEquals("Multi-Tab Test Page", al.get("header text"));

    al.act("switch to next browser tab");
    Assertions.assertEquals("about:blank", al.get("current page URL"));

    al.act("switch to next browser tab");
    Assertions.assertEquals("Multi-Tab Test Page", al.get("header text"));

    al.act("switch to previous browser tab");
    Assertions.assertEquals("about:blank", al.get("current page URL"));
  }

  @Test
  void testSwitchingToSlowlyOpeningTab() throws IOException {
    try (SlowTabPage page = SlowTabPage.start()) {
      navigate(page.url);

      al.act("click on 'Open Slow Tab' button");

      // al.get() is too slow which gives tab enough time to arrive on its own
      Assertions.assertEquals(page.slowTabUrl, al.driver().url());
      Assertions.assertEquals("Slow Tab", al.get("header text"));
    }
  }

  @Test
  void testStayingOnTabWhenAutoswitchIsOff() throws IOException {
    setAutoswitchToNewTab(false);

    try (SlowTabPage page = SlowTabPage.start()) {
      navigate(page.url);

      al.act("click on 'Open Slow Tab' button");

      // Only assert once the tab is really there, otherwise nothing can be
      // picked up and the test passes even when the switch is ignored
      waitForTabCount(2);

      Assertions.assertEquals("Opener", al.get("header text"));
      Assertions.assertEquals(page.url, al.driver().url());
    }
  }

  private static void setAutoswitchToNewTab(boolean value) {
    if (al.driver() instanceof PlaywrightDriver playwrightDriver) {
      playwrightDriver.autoswitchToNewTab = value;
    } else if (al.driver() instanceof SeleniumDriver seleniumDriver) {
      seleniumDriver.autoswitchToNewTab = value;
    }
  }
}
