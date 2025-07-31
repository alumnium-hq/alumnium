# ruff: noqa: E501
import unicodedata
from pathlib import Path

from pytest import fixture

from alumnium.accessibility import UIAutomator2AccessibiltyTree


def tree(filename: str) -> UIAutomator2AccessibiltyTree:
    with open(Path(__file__).parent.parent / "fixtures" / f"{filename}.xml", "r", encoding="UTF-8") as f:
        xml = unicodedata.normalize("NFKC", f.read())
    return UIAutomator2AccessibiltyTree(xml)


@fixture
def simple_tree() -> UIAutomator2AccessibiltyTree:
    return tree("uiautomator2_accessibility_tree")


def test_element_by_id(simple_tree: UIAutomator2AccessibiltyTree):
    element = simple_tree.element_by_id(8)
    assert element.id == 8
    assert element.androidresourceid == "org.wikipedia.alpha:id/fragment_container"
    assert element.type == "android.widget.FrameLayout"


def test_simple_uitree(simple_tree: UIAutomator2AccessibiltyTree):
    expected_output = """<hierarchy>
  <FrameLayout id="2">
    <LinearLayout id="3">
      <FrameLayout id="4">
        <FrameLayout id="5" resource-id="org.wikipedia.alpha:id/action_bar_root">
          <FrameLayout id="6" resource-id="android:id/content">
            <FrameLayout id="7">
              <FrameLayout id="8" resource-id="org.wikipedia.alpha:id/fragment_container">
                <FrameLayout id="9" resource-id="org.wikipedia.alpha:id/fragment_main_container">
                  <LinearLayout id="10">
                    <ViewGroup id="11" resource-id="org.wikipedia.alpha:id/fragment_main_coordinator">
                      <ViewPager id="12" resource-id="org.wikipedia.alpha:id/fragment_main_view_pager">
                        <ViewGroup id="13" resource-id="org.wikipedia.alpha:id/feed_swipe_refresh_layout">
                          <FrameLayout id="14">
                            <RecyclerView id="15" resource-id="org.wikipedia.alpha:id/fragment_feed_feed">
                              <FrameLayout id="16">
                                <LinearLayout id="17" resource-id="org.wikipedia.alpha:id/search_container" clickable="true">
                                  <ImageView id="18" content-desc="Search Wikipedia" />
                                  <TextView id="19" text="Search Wikipedia" />
                                  <ImageView id="20" resource-id="org.wikipedia.alpha:id/voice_search_button" content-desc="Search Wikipedia" clickable="true" />
                                </LinearLayout>
                              </FrameLayout>
                              <FrameLayout id="21">
                                <RelativeLayout id="22">
                                  <FrameLayout id="23" resource-id="org.wikipedia.alpha:id/view_list_card_header">
                                    <LinearLayout id="24">
                                      <LinearLayout id="25">
                                        <ImageView id="26" resource-id="org.wikipedia.alpha:id/view_card_header_image" />
                                        <TextView id="27" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="In the news" />
                                      </LinearLayout>
                                      <LinearLayout id="28">
                                        <TextView id="29" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" />
                                        <ImageView id="30" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <RecyclerView id="31" resource-id="org.wikipedia.alpha:id/view_list_card_list">
                                    <FrameLayout id="32" clickable="true">
                                      <LinearLayout id="33">
                                        <ImageView id="34" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" />
                                        <TextView id="35" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="The Vera C. Rubin Observatory in Chile releases the first light images from its new 8.4-meter (28 ft) telescope." />
                                      </LinearLayout>
                                    </FrameLayout>
                                    <FrameLayout id="36" clickable="true">
                                      <LinearLayout id="37">
                                        <ImageView id="38" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" />
                                        <TextView id="39" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="In basketball, the Oklahoma City Thunder defeat the Indiana Pacers to win the NBA Finals." />
                                      </LinearLayout>
                                    </FrameLayout>
                                  </RecyclerView>
                                </RelativeLayout>
                              </FrameLayout>
                              <FrameLayout id="40">
                                <LinearLayout id="41">
                                  <FrameLayout id="42" resource-id="org.wikipedia.alpha:id/view_featured_article_card_header">
                                    <LinearLayout id="43">
                                      <LinearLayout id="44">
                                        <ImageView id="45" resource-id="org.wikipedia.alpha:id/view_card_header_image" />
                                        <TextView id="46" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="Featured article" />
                                      </LinearLayout>
                                      <LinearLayout id="47">
                                        <TextView id="48" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" />
                                        <ImageView id="49" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <ImageView id="50" resource-id="org.wikipedia.alpha:id/view_featured_article_card_image" clickable="true" />
                                  <View id="51" />
                                  <LinearLayout id="52" resource-id="org.wikipedia.alpha:id/view_featured_article_card_text_container" clickable="true">
                                    <TextView id="53" resource-id="org.wikipedia.alpha:id/view_featured_article_card_article_title" text="History of education in Wales (1701–1870)" />
                                  </LinearLayout>
                                </LinearLayout>
                              </FrameLayout>
                            </RecyclerView>
                            <View id="54" resource-id="org.wikipedia.alpha:id/fragment_feed_header" />
                          </FrameLayout>
                        </ViewGroup>
                      </ViewPager>
                    </ViewGroup>
                    <FrameLayout id="55" resource-id="org.wikipedia.alpha:id/fragment_main_nav_tab_layout">
                      <ViewGroup id="56">
                        <FrameLayout id="57" content-desc="Explore" clickable="true">
                          <ViewGroup id="58">
                            <TextView id="59" resource-id="org.wikipedia.alpha:id/largeLabel" text="Explore" />
                          </ViewGroup>
                          <ImageView id="60" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                        <FrameLayout id="61" content-desc="My lists" clickable="true">
                          <ViewGroup id="62" />
                          <ImageView id="63" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                        <FrameLayout id="64" content-desc="History" clickable="true">
                          <ViewGroup id="65" />
                          <ImageView id="66" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                        <FrameLayout id="67" content-desc="Nearby" clickable="true">
                          <ViewGroup id="68" />
                          <ImageView id="69" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                      </ViewGroup>
                    </FrameLayout>
                  </LinearLayout>
                </FrameLayout>
              </FrameLayout>
              <ViewGroup id="70" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar">
                <ImageView id="71" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar_wordmark" />
                <LinearLayoutCompat id="72">
                  <TextView id="73" resource-id="org.wikipedia.alpha:id/menu_overflow_button" content-desc="More options" clickable="true" />
                </LinearLayoutCompat>
              </ViewGroup>
            </FrameLayout>
          </FrameLayout>
        </FrameLayout>
      </FrameLayout>
    </LinearLayout>
    <View id="74" resource-id="android:id/statusBarBackground" />
  </FrameLayout>
  <FrameLayout id="76">
    <LinearLayout id="77">
      <FrameLayout id="78">
        <FrameLayout id="79" resource-id="org.wikipedia.alpha:id/action_bar_root">
          <FrameLayout id="80" resource-id="android:id/content">
            <FrameLayout id="81">
              <FrameLayout id="82" resource-id="org.wikipedia.alpha:id/fragment_container">
                <FrameLayout id="83" resource-id="org.wikipedia.alpha:id/fragment_main_container">
                  <LinearLayout id="84">
                    <ViewGroup id="85" resource-id="org.wikipedia.alpha:id/fragment_main_coordinator">
                      <ViewPager id="86" resource-id="org.wikipedia.alpha:id/fragment_main_view_pager">
                        <ViewGroup id="87" resource-id="org.wikipedia.alpha:id/feed_swipe_refresh_layout">
                          <FrameLayout id="88">
                            <RecyclerView id="89" resource-id="org.wikipedia.alpha:id/fragment_feed_feed">
                              <FrameLayout id="90">
                                <LinearLayout id="91" resource-id="org.wikipedia.alpha:id/search_container" clickable="true">
                                  <ImageView id="92" content-desc="Search Wikipedia" />
                                  <TextView id="93" text="Search Wikipedia" />
                                  <ImageView id="94" resource-id="org.wikipedia.alpha:id/voice_search_button" content-desc="Search Wikipedia" clickable="true" />
                                </LinearLayout>
                              </FrameLayout>
                              <FrameLayout id="95">
                                <RelativeLayout id="96">
                                  <FrameLayout id="97" resource-id="org.wikipedia.alpha:id/view_list_card_header">
                                    <LinearLayout id="98">
                                      <LinearLayout id="99">
                                        <ImageView id="100" resource-id="org.wikipedia.alpha:id/view_card_header_image" />
                                        <TextView id="101" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="In the news" />
                                      </LinearLayout>
                                      <LinearLayout id="102">
                                        <TextView id="103" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" />
                                        <ImageView id="104" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <RecyclerView id="105" resource-id="org.wikipedia.alpha:id/view_list_card_list">
                                    <FrameLayout id="106" clickable="true">
                                      <LinearLayout id="107">
                                        <ImageView id="108" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" />
                                        <TextView id="109" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="The Vera C. Rubin Observatory in Chile releases the first light images from its new 8.4-meter (28 ft) telescope." />
                                      </LinearLayout>
                                    </FrameLayout>
                                    <FrameLayout id="110" clickable="true">
                                      <LinearLayout id="111">
                                        <ImageView id="112" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" />
                                        <TextView id="113" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="In basketball, the Oklahoma City Thunder defeat the Indiana Pacers to win the NBA Finals." />
                                      </LinearLayout>
                                    </FrameLayout>
                                    <FrameLayout id="114" clickable="true">
                                      <LinearLayout id="115">
                                        <ImageView id="116" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" />
                                      </LinearLayout>
                                    </FrameLayout>
                                  </RecyclerView>
                                </RelativeLayout>
                              </FrameLayout>
                              <FrameLayout id="117">
                                <LinearLayout id="118">
                                  <FrameLayout id="119" resource-id="org.wikipedia.alpha:id/view_featured_article_card_header">
                                    <LinearLayout id="120">
                                      <LinearLayout id="121">
                                        <ImageView id="122" resource-id="org.wikipedia.alpha:id/view_card_header_image" />
                                        <TextView id="123" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="Featured article" />
                                      </LinearLayout>
                                      <LinearLayout id="124">
                                        <TextView id="125" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" />
                                        <ImageView id="126" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <ImageView id="127" resource-id="org.wikipedia.alpha:id/view_featured_article_card_image" clickable="true" />
                                  <View id="128" />
                                  <LinearLayout id="129" resource-id="org.wikipedia.alpha:id/view_featured_article_card_text_container" clickable="true">
                                    <TextView id="130" resource-id="org.wikipedia.alpha:id/view_featured_article_card_article_title" text="History of education in Wales (1701–1870)" />
                                    <TextView id="131" resource-id="org.wikipedia.alpha:id/view_featured_article_card_extract" text="The period between 1701 and the 1870 Elementary Education Act saw an expansion in access to formal education in Wales, though schooling was not yet universal." />
                                  </LinearLayout>
                                </LinearLayout>
                              </FrameLayout>
                            </RecyclerView>
                            <View id="132" resource-id="org.wikipedia.alpha:id/fragment_feed_header" />
                          </FrameLayout>
                        </ViewGroup>
                      </ViewPager>
                    </ViewGroup>
                    <FrameLayout id="133" resource-id="org.wikipedia.alpha:id/fragment_main_nav_tab_layout">
                      <ViewGroup id="134">
                        <FrameLayout id="135" content-desc="Explore" clickable="true">
                          <ViewGroup id="136">
                            <TextView id="137" resource-id="org.wikipedia.alpha:id/largeLabel" text="Explore" />
                          </ViewGroup>
                          <ImageView id="138" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                        <FrameLayout id="139" content-desc="My lists" clickable="true">
                          <ViewGroup id="140" />
                          <ImageView id="141" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                        <FrameLayout id="142" content-desc="History" clickable="true">
                          <ViewGroup id="143" />
                          <ImageView id="144" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                        <FrameLayout id="145" content-desc="Nearby" clickable="true">
                          <ViewGroup id="146" />
                          <ImageView id="147" resource-id="org.wikipedia.alpha:id/icon" />
                        </FrameLayout>
                      </ViewGroup>
                    </FrameLayout>
                  </LinearLayout>
                </FrameLayout>
              </FrameLayout>
              <ViewGroup id="148" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar">
                <ImageView id="149" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar_wordmark" />
                <LinearLayoutCompat id="150">
                  <TextView id="151" resource-id="org.wikipedia.alpha:id/menu_overflow_button" content-desc="More options" clickable="true" />
                </LinearLayoutCompat>
              </ViewGroup>
            </FrameLayout>
          </FrameLayout>
        </FrameLayout>
      </FrameLayout>
    </LinearLayout>
    <View id="152" resource-id="android:id/navigationBarBackground" />
  </FrameLayout>
</hierarchy>"""

    actual_output = (simple_tree.to_xml()).strip()
    expected_output = expected_output.strip()
    assert actual_output == expected_output
