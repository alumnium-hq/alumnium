package ai.alumnium.system;

import ai.alumnium.tool.SwitchToNextTabTool;
import ai.alumnium.tool.SwitchToPreviousTabTool;
import java.io.File;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public class TabsTest extends BaseTest {

  static {
    extraTools = List.of(SwitchToNextTabTool.class, SwitchToPreviousTabTool.class);
  }

  private static final String MULTI_TAB_URL =
      new File("../python/examples/support/pages/multi_tab_page.html").toURI().toString();

  @Test
  void testSwitchingTabs() {
    navigate(MULTI_TAB_URL);

    al.act("click on 'Open New Tab' button");
    Assertions.assertEquals("about:blank", al.get("current page URL").toObject());

    al.act("switch to previous browser tab");
    Assertions.assertEquals("Multi-Tab Test Page", al.get("header text").toObject());

    al.act("switch to next browser tab");
    Assertions.assertEquals("about:blank", al.get("current page URL").toObject());

    al.act("switch to next browser tab");
    Assertions.assertEquals("Multi-Tab Test Page", al.get("header text").toObject());

    al.act("switch to previous browser tab");
    Assertions.assertEquals("about:blank", al.get("current page URL").toObject());
  }
}
