import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ServerUIAutomator2AccessibilityTree } from "./ServerUIAutomator2AccessibilityTree.ts";

describe(ServerUIAutomator2AccessibilityTree, () => {
  it("converts and trims a UIAutomator2 tree", async () => {
    const tree = await fixtureTree("uiautomator2_accessibility_tree");
    const xml = tree.toXml();

    expect(xml).toMatchInlineSnapshot(`
      "<div id=1>
        <div id=10>
          <ViewPager id=12 resource-id="fragment_main_view_pager">
            <RecyclerView id=15 resource-id="fragment_feed_feed">
              <div id=17 resource-id="search_container" clickable>
                <ImageView id=18 content-desc="Search Wikipedia"/>
                <div id=19>Search Wikipedia</div>
                <ImageView id=20 content-desc="Search Wikipedia" resource-id="voice_search_button" clickable/>
              </div>
              <div id=22>
                <div id=24>
                  <div id=25>
                    <ImageView id=26 resource-id="view_card_header_image"/>
                    <div id=27 resource-id="view_card_header_title">In the news</div>
                  </div>
                  <div id=28>
                    <div id=29 resource-id="view_card_header_subtitle">Jun 25, 2025</div>
                    <ImageView id=30 content-desc="More options" resource-id="view_list_card_header_menu" clickable/>
                  </div>
                </div>
                <RecyclerView id=31 resource-id="view_list_card_list">
                  <div id=32 clickable>
                    <ImageView id=34 resource-id="horizontal_scroll_list_item_image"/>
                    <div id=35 resource-id="horizontal_scroll_list_item_text">The Vera C. Rubin Observatory in Chile releases the first light images from its new 8.4-meter (28 ft) telescope.</div>
                  </div>
                  <div id=36 clickable>
                    <ImageView id=38 resource-id="horizontal_scroll_list_item_image"/>
                    <div id=39 resource-id="horizontal_scroll_list_item_text">In basketball, the Oklahoma City Thunder defeat the Indiana Pacers to win the NBA Finals.</div>
                  </div>
                </RecyclerView>
              </div>
              <div id=41>
                <div id=43>
                  <div id=44>
                    <ImageView id=45 resource-id="view_card_header_image"/>
                    <div id=46 resource-id="view_card_header_title">Featured article</div>
                  </div>
                  <div id=47>
                    <div id=48 resource-id="view_card_header_subtitle">Jun 25, 2025</div>
                    <ImageView id=49 content-desc="More options" resource-id="view_list_card_header_menu" clickable/>
                  </div>
                </div>
                <ImageView id=50 resource-id="view_featured_article_card_image" clickable/>
                <div id=52 resource-id="view_featured_article_card_text_container" clickable>
                  <div id=53 resource-id="view_featured_article_card_article_title">History of education in Wales (1701–1870)</div>
                </div>
              </div>
            </RecyclerView>
          </ViewPager>
          <div id=56>
            <div id=57 content-desc="Explore" clickable>
              <ImageView id=60 resource-id="icon"/>
            </div>
            <div id=61 content-desc="My lists" clickable>
              <ImageView id=63 resource-id="icon"/>
            </div>
            <div id=64 content-desc="History" clickable>
              <ImageView id=66 resource-id="icon"/>
            </div>
            <div id=67 content-desc="Nearby" clickable>
              <ImageView id=69 resource-id="icon"/>
            </div>
          </div>
        </div>
        <div id=70 resource-id="single_fragment_toolbar">
          <ImageView id=71 resource-id="single_fragment_toolbar_wordmark"/>
          <div id=73 content-desc="More options" resource-id="menu_overflow_button" clickable/>
        </div>
      </div>
      <div id=75>
        <div id=84>
          <ViewPager id=86 resource-id="fragment_main_view_pager">
            <RecyclerView id=89 resource-id="fragment_feed_feed">
              <div id=91 resource-id="search_container" clickable>
                <ImageView id=92 content-desc="Search Wikipedia"/>
                <div id=93>Search Wikipedia</div>
                <ImageView id=94 content-desc="Search Wikipedia" resource-id="voice_search_button" clickable/>
              </div>
              <div id=96>
                <div id=98>
                  <div id=99>
                    <ImageView id=100 resource-id="view_card_header_image"/>
                    <div id=101 resource-id="view_card_header_title">In the news</div>
                  </div>
                  <div id=102>
                    <div id=103 resource-id="view_card_header_subtitle">Jun 25, 2025</div>
                    <ImageView id=104 content-desc="More options" resource-id="view_list_card_header_menu" clickable/>
                  </div>
                </div>
                <RecyclerView id=105 resource-id="view_list_card_list">
                  <div id=106 clickable>
                    <ImageView id=108 resource-id="horizontal_scroll_list_item_image"/>
                    <div id=109 resource-id="horizontal_scroll_list_item_text">The Vera C. Rubin Observatory in Chile releases the first light images from its new 8.4-meter (28 ft) telescope.</div>
                  </div>
                  <div id=110 clickable>
                    <ImageView id=112 resource-id="horizontal_scroll_list_item_image"/>
                    <div id=113 resource-id="horizontal_scroll_list_item_text">In basketball, the Oklahoma City Thunder defeat the Indiana Pacers to win the NBA Finals.</div>
                  </div>
                  <div id=114 clickable>
                    <ImageView id=116 resource-id="horizontal_scroll_list_item_image"/>
                  </div>
                </RecyclerView>
              </div>
              <div id=118>
                <div id=120>
                  <div id=121>
                    <ImageView id=122 resource-id="view_card_header_image"/>
                    <div id=123 resource-id="view_card_header_title">Featured article</div>
                  </div>
                  <div id=124>
                    <div id=125 resource-id="view_card_header_subtitle">Jun 25, 2025</div>
                    <ImageView id=126 content-desc="More options" resource-id="view_list_card_header_menu" clickable/>
                  </div>
                </div>
                <ImageView id=127 resource-id="view_featured_article_card_image" clickable/>
                <div id=129 resource-id="view_featured_article_card_text_container" clickable>
                  <div id=130 resource-id="view_featured_article_card_article_title">History of education in Wales (1701–1870)</div>
                  <div id=131 resource-id="view_featured_article_card_extract">The period between 1701 and the 1870 Elementary Education Act saw an expansion in access to formal education in Wales, though schooling was not yet universal.</div>
                </div>
              </div>
            </RecyclerView>
          </ViewPager>
          <div id=134>
            <div id=135 content-desc="Explore" clickable>
              <ImageView id=138 resource-id="icon"/>
            </div>
            <div id=139 content-desc="My lists" clickable>
              <ImageView id=141 resource-id="icon"/>
            </div>
            <div id=142 content-desc="History" clickable>
              <ImageView id=144 resource-id="icon"/>
            </div>
            <div id=145 content-desc="Nearby" clickable>
              <ImageView id=147 resource-id="icon"/>
            </div>
          </div>
        </div>
        <div id=148 resource-id="single_fragment_toolbar">
          <ImageView id=149 resource-id="single_fragment_toolbar_wordmark"/>
          <div id=151 content-desc="More options" resource-id="menu_overflow_button" clickable/>
        </div>
      </div>"
    `);
  });

  it("supports excluding attributes", async () => {
    const tree = await fixtureTree("uiautomator2_accessibility_tree");
    const xml = tree.toXml(new Set(["id", "resource-id"]));

    expect(xml).not.toContain(" id=");
    expect(xml).not.toContain(" resource-id=");
  });

  it("trims text attributes and removes whitespace-only TextViews", () => {
    const tree = new ServerUIAutomator2AccessibilityTree(`
      <hierarchy>
        <android.widget.FrameLayout raw_id="1">
          <android.widget.TextView raw_id="2" text=" "/>
          <android.widget.TextView raw_id="3" text="      "/>
          <android.widget.TextView raw_id="4" text="  Search Wikipedia  "/>
        </android.widget.FrameLayout>
      </hierarchy>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<div id=1>
        <div id=5>Search Wikipedia</div>
      </div>"
    `);
  });

  it("simplifies Android resource IDs", () => {
    const tree = new ServerUIAutomator2AccessibilityTree(`
      <hierarchy>
        <android.widget.FrameLayout raw_id="1">
          <android.widget.TextView raw_id="2" text="Address" resource-id="com.android.chrome:id/location_bar_status"/>
          <android.widget.TextView raw_id="3" text="Custom" resource-id="custom-resource"/>
        </android.widget.FrameLayout>
      </hierarchy>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<div id=1>
        <div id=3 resource-id="location_bar_status">Address</div>
        <div id=4 resource-id="custom-resource">Custom</div>
      </div>"
    `);
  });

  it("removes TextViews duplicated by parent content descriptions", () => {
    const tree = new ServerUIAutomator2AccessibilityTree(`
      <hierarchy>
        <android.widget.FrameLayout raw_id="1">
          <android.view.View raw_id="2" content-desc="All" clickable="true">
            <android.widget.TextView raw_id="3" text="All"/>
          </android.view.View>
          <android.view.View raw_id="4" content-desc="Active" clickable="true">
            <android.widget.TextView raw_id="5" text="Different"/>
          </android.view.View>
          <android.widget.TextView raw_id="6" text="item left"/>
        </android.widget.FrameLayout>
      </hierarchy>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<div id=1>
        <div id=3 content-desc="All" clickable/>
        <div id=5 content-desc="Active" clickable>
          <div id=6>Different</div>
        </div>
        <div id=7>item left</div>
      </div>"
    `);
  });

  it("renders element text as content while preserving other attributes", () => {
    const tree = new ServerUIAutomator2AccessibilityTree(`
      <hierarchy>
        <android.widget.FrameLayout raw_id="1">
          <android.widget.Button raw_id="2" text=")" resource-id=")" clickable="true"/>
          <android.widget.TextView raw_id="3" text="Dark Mode"/>
        </android.widget.FrameLayout>
      </hierarchy>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<div id=1>
        <Button id=3 resource-id=")" clickable>)</Button>
        <div id=4>Dark Mode</div>
      </div>"
    `);
  });

  describe("snapshots", () => {
    const fixturesPath = new URL(
      "../../../tests/unit/fixtures/tree/android/",
      import.meta.url,
    );
    const fixtureNames = readdirSync(fixturesPath)
      .filter(
        (name) => name.startsWith("uiautomator2-") && name.endsWith(".xml"),
      )
      .sort();

    it.for(fixtureNames)("%s", async (fixtureName) => {
      const fixtureXml = await fs.readFile(
        new URL(fixtureName, fixturesPath),
        "utf-8",
      );
      const tree = new ServerUIAutomator2AccessibilityTree(fixtureXml);

      await expect(tree.toXml()).toMatchFileSnapshot(
        `./__snapshots__/uiautomator2/${fixtureName.replace(".xml", ".snap.xml")}`,
      );
    });
  });
});

async function fixtureTree(
  filename: string,
): Promise<ServerUIAutomator2AccessibilityTree> {
  const fixturePath = new URL(
    `./__fixtures__/${filename}.xml`,
    import.meta.url,
  );
  const xml = await fs.readFile(fixturePath, "utf-8");
  return new ServerUIAutomator2AccessibilityTree(xml.normalize("NFKC"));
}
