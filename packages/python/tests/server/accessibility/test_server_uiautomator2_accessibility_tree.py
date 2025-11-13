# ruff: noqa: E501
import unicodedata
from pathlib import Path

from pytest import fixture

from alumnium.server.accessibility import ServerUIAutomator2AccessibilityTree


def tree(filename: str) -> ServerUIAutomator2AccessibilityTree:
    with open(Path(__file__).parent.parent.parent / "fixtures" / f"{filename}.xml", "r", encoding="UTF-8") as f:
        xml = unicodedata.normalize("NFKC", f.read())
    return ServerUIAutomator2AccessibilityTree(xml)


@fixture
def simple_tree() -> ServerUIAutomator2AccessibilityTree:
    return tree("uiautomator2_accessibility_tree")


def test_simple_tree(simple_tree: ServerUIAutomator2AccessibilityTree):
    expected_output = """<hierarchy>
  <FrameLayout id="2" clickable="false">
    <LinearLayout id="3" clickable="false">
      <FrameLayout id="4" clickable="false">
        <FrameLayout id="5" resource-id="org.wikipedia.alpha:id/action_bar_root" clickable="false">
          <FrameLayout id="6" resource-id="android:id/content" clickable="false">
            <FrameLayout id="7" clickable="false">
              <FrameLayout id="8" resource-id="org.wikipedia.alpha:id/fragment_container" clickable="false">
                <FrameLayout id="9" resource-id="org.wikipedia.alpha:id/fragment_main_container" clickable="false">
                  <LinearLayout id="10" clickable="false">
                    <ViewGroup id="11" resource-id="org.wikipedia.alpha:id/fragment_main_coordinator" clickable="false">
                      <ViewPager id="12" resource-id="org.wikipedia.alpha:id/fragment_main_view_pager" clickable="false">
                        <ViewGroup id="13" resource-id="org.wikipedia.alpha:id/feed_swipe_refresh_layout" clickable="false">
                          <FrameLayout id="14" clickable="false">
                            <RecyclerView id="15" resource-id="org.wikipedia.alpha:id/fragment_feed_feed" clickable="false">
                              <FrameLayout id="16" clickable="false">
                                <LinearLayout id="17" resource-id="org.wikipedia.alpha:id/search_container" clickable="true">
                                  <ImageView id="18" content-desc="Search Wikipedia" clickable="false" />
                                  <TextView id="19" text="Search Wikipedia" clickable="false" />
                                  <ImageView id="20" resource-id="org.wikipedia.alpha:id/voice_search_button" content-desc="Search Wikipedia" clickable="true" />
                                </LinearLayout>
                              </FrameLayout>
                              <FrameLayout id="21" clickable="false">
                                <RelativeLayout id="22" clickable="false">
                                  <FrameLayout id="23" resource-id="org.wikipedia.alpha:id/view_list_card_header" clickable="false">
                                    <LinearLayout id="24" clickable="false">
                                      <LinearLayout id="25" clickable="false">
                                        <ImageView id="26" resource-id="org.wikipedia.alpha:id/view_card_header_image" clickable="false" />
                                        <TextView id="27" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="In the news" clickable="false" />
                                      </LinearLayout>
                                      <LinearLayout id="28" clickable="false">
                                        <TextView id="29" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" clickable="false" />
                                        <ImageView id="30" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <RecyclerView id="31" resource-id="org.wikipedia.alpha:id/view_list_card_list" clickable="false">
                                    <FrameLayout id="32" clickable="true">
                                      <LinearLayout id="33" clickable="false">
                                        <ImageView id="34" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" clickable="false" />
                                        <TextView id="35" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="The Vera C. Rubin Observatory in Chile releases the first light images from its new 8.4-meter (28 ft) telescope." clickable="false" />
                                      </LinearLayout>
                                    </FrameLayout>
                                    <FrameLayout id="36" clickable="true">
                                      <LinearLayout id="37" clickable="false">
                                        <ImageView id="38" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" clickable="false" />
                                        <TextView id="39" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="In basketball, the Oklahoma City Thunder defeat the Indiana Pacers to win the NBA Finals." clickable="false" />
                                      </LinearLayout>
                                    </FrameLayout>
                                  </RecyclerView>
                                </RelativeLayout>
                              </FrameLayout>
                              <FrameLayout id="40" clickable="false">
                                <LinearLayout id="41" clickable="false">
                                  <FrameLayout id="42" resource-id="org.wikipedia.alpha:id/view_featured_article_card_header" clickable="false">
                                    <LinearLayout id="43" clickable="false">
                                      <LinearLayout id="44" clickable="false">
                                        <ImageView id="45" resource-id="org.wikipedia.alpha:id/view_card_header_image" clickable="false" />
                                        <TextView id="46" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="Featured article" clickable="false" />
                                      </LinearLayout>
                                      <LinearLayout id="47" clickable="false">
                                        <TextView id="48" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" clickable="false" />
                                        <ImageView id="49" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <ImageView id="50" resource-id="org.wikipedia.alpha:id/view_featured_article_card_image" clickable="true" />
                                  <View id="51" clickable="false" />
                                  <LinearLayout id="52" resource-id="org.wikipedia.alpha:id/view_featured_article_card_text_container" clickable="true">
                                    <TextView id="53" resource-id="org.wikipedia.alpha:id/view_featured_article_card_article_title" text="History of education in Wales (1701–1870)" clickable="false" />
                                  </LinearLayout>
                                </LinearLayout>
                              </FrameLayout>
                            </RecyclerView>
                            <View id="54" resource-id="org.wikipedia.alpha:id/fragment_feed_header" clickable="false" />
                          </FrameLayout>
                        </ViewGroup>
                      </ViewPager>
                    </ViewGroup>
                    <FrameLayout id="55" resource-id="org.wikipedia.alpha:id/fragment_main_nav_tab_layout" clickable="false">
                      <ViewGroup id="56" clickable="false">
                        <FrameLayout id="57" content-desc="Explore" clickable="true">
                          <ViewGroup id="58" clickable="false">
                            <TextView id="59" resource-id="org.wikipedia.alpha:id/largeLabel" text="Explore" clickable="false" />
                          </ViewGroup>
                          <ImageView id="60" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                        <FrameLayout id="61" content-desc="My lists" clickable="true">
                          <ViewGroup id="62" clickable="false" />
                          <ImageView id="63" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                        <FrameLayout id="64" content-desc="History" clickable="true">
                          <ViewGroup id="65" clickable="false" />
                          <ImageView id="66" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                        <FrameLayout id="67" content-desc="Nearby" clickable="true">
                          <ViewGroup id="68" clickable="false" />
                          <ImageView id="69" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                      </ViewGroup>
                    </FrameLayout>
                  </LinearLayout>
                </FrameLayout>
              </FrameLayout>
              <ViewGroup id="70" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar" clickable="false">
                <ImageView id="71" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar_wordmark" clickable="false" />
                <LinearLayoutCompat id="72" clickable="false">
                  <TextView id="73" resource-id="org.wikipedia.alpha:id/menu_overflow_button" content-desc="More options" clickable="true" />
                </LinearLayoutCompat>
              </ViewGroup>
            </FrameLayout>
          </FrameLayout>
        </FrameLayout>
      </FrameLayout>
    </LinearLayout>
    <View id="74" resource-id="android:id/statusBarBackground" clickable="false" />
  </FrameLayout>
  <FrameLayout id="76" clickable="false">
    <LinearLayout id="77" clickable="false">
      <FrameLayout id="78" clickable="false">
        <FrameLayout id="79" resource-id="org.wikipedia.alpha:id/action_bar_root" clickable="false">
          <FrameLayout id="80" resource-id="android:id/content" clickable="false">
            <FrameLayout id="81" clickable="false">
              <FrameLayout id="82" resource-id="org.wikipedia.alpha:id/fragment_container" clickable="false">
                <FrameLayout id="83" resource-id="org.wikipedia.alpha:id/fragment_main_container" clickable="false">
                  <LinearLayout id="84" clickable="false">
                    <ViewGroup id="85" resource-id="org.wikipedia.alpha:id/fragment_main_coordinator" clickable="false">
                      <ViewPager id="86" resource-id="org.wikipedia.alpha:id/fragment_main_view_pager" clickable="false">
                        <ViewGroup id="87" resource-id="org.wikipedia.alpha:id/feed_swipe_refresh_layout" clickable="false">
                          <FrameLayout id="88" clickable="false">
                            <RecyclerView id="89" resource-id="org.wikipedia.alpha:id/fragment_feed_feed" clickable="false">
                              <FrameLayout id="90" clickable="false">
                                <LinearLayout id="91" resource-id="org.wikipedia.alpha:id/search_container" clickable="true">
                                  <ImageView id="92" content-desc="Search Wikipedia" clickable="false" />
                                  <TextView id="93" text="Search Wikipedia" clickable="false" />
                                  <ImageView id="94" resource-id="org.wikipedia.alpha:id/voice_search_button" content-desc="Search Wikipedia" clickable="true" />
                                </LinearLayout>
                              </FrameLayout>
                              <FrameLayout id="95" clickable="false">
                                <RelativeLayout id="96" clickable="false">
                                  <FrameLayout id="97" resource-id="org.wikipedia.alpha:id/view_list_card_header" clickable="false">
                                    <LinearLayout id="98" clickable="false">
                                      <LinearLayout id="99" clickable="false">
                                        <ImageView id="100" resource-id="org.wikipedia.alpha:id/view_card_header_image" clickable="false" />
                                        <TextView id="101" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="In the news" clickable="false" />
                                      </LinearLayout>
                                      <LinearLayout id="102" clickable="false">
                                        <TextView id="103" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" clickable="false" />
                                        <ImageView id="104" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <RecyclerView id="105" resource-id="org.wikipedia.alpha:id/view_list_card_list" clickable="false">
                                    <FrameLayout id="106" clickable="true">
                                      <LinearLayout id="107" clickable="false">
                                        <ImageView id="108" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" clickable="false" />
                                        <TextView id="109" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="The Vera C. Rubin Observatory in Chile releases the first light images from its new 8.4-meter (28 ft) telescope." clickable="false" />
                                      </LinearLayout>
                                    </FrameLayout>
                                    <FrameLayout id="110" clickable="true">
                                      <LinearLayout id="111" clickable="false">
                                        <ImageView id="112" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" clickable="false" />
                                        <TextView id="113" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_text" text="In basketball, the Oklahoma City Thunder defeat the Indiana Pacers to win the NBA Finals." clickable="false" />
                                      </LinearLayout>
                                    </FrameLayout>
                                    <FrameLayout id="114" clickable="true">
                                      <LinearLayout id="115" clickable="false">
                                        <ImageView id="116" resource-id="org.wikipedia.alpha:id/horizontal_scroll_list_item_image" clickable="false" />
                                      </LinearLayout>
                                    </FrameLayout>
                                  </RecyclerView>
                                </RelativeLayout>
                              </FrameLayout>
                              <FrameLayout id="117" clickable="false">
                                <LinearLayout id="118" clickable="false">
                                  <FrameLayout id="119" resource-id="org.wikipedia.alpha:id/view_featured_article_card_header" clickable="false">
                                    <LinearLayout id="120" clickable="false">
                                      <LinearLayout id="121" clickable="false">
                                        <ImageView id="122" resource-id="org.wikipedia.alpha:id/view_card_header_image" clickable="false" />
                                        <TextView id="123" resource-id="org.wikipedia.alpha:id/view_card_header_title" text="Featured article" clickable="false" />
                                      </LinearLayout>
                                      <LinearLayout id="124" clickable="false">
                                        <TextView id="125" resource-id="org.wikipedia.alpha:id/view_card_header_subtitle" text="Jun 25, 2025" clickable="false" />
                                        <ImageView id="126" resource-id="org.wikipedia.alpha:id/view_list_card_header_menu" content-desc="More options" clickable="true" />
                                      </LinearLayout>
                                    </LinearLayout>
                                  </FrameLayout>
                                  <ImageView id="127" resource-id="org.wikipedia.alpha:id/view_featured_article_card_image" clickable="true" />
                                  <View id="128" clickable="false" />
                                  <LinearLayout id="129" resource-id="org.wikipedia.alpha:id/view_featured_article_card_text_container" clickable="true">
                                    <TextView id="130" resource-id="org.wikipedia.alpha:id/view_featured_article_card_article_title" text="History of education in Wales (1701–1870)" clickable="false" />
                                    <TextView id="131" resource-id="org.wikipedia.alpha:id/view_featured_article_card_extract" text="The period between 1701 and the 1870 Elementary Education Act saw an expansion in access to formal education in Wales, though schooling was not yet universal." clickable="false" />
                                  </LinearLayout>
                                </LinearLayout>
                              </FrameLayout>
                            </RecyclerView>
                            <View id="132" resource-id="org.wikipedia.alpha:id/fragment_feed_header" clickable="false" />
                          </FrameLayout>
                        </ViewGroup>
                      </ViewPager>
                    </ViewGroup>
                    <FrameLayout id="133" resource-id="org.wikipedia.alpha:id/fragment_main_nav_tab_layout" clickable="false">
                      <ViewGroup id="134" clickable="false">
                        <FrameLayout id="135" content-desc="Explore" clickable="true">
                          <ViewGroup id="136" clickable="false">
                            <TextView id="137" resource-id="org.wikipedia.alpha:id/largeLabel" text="Explore" clickable="false" />
                          </ViewGroup>
                          <ImageView id="138" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                        <FrameLayout id="139" content-desc="My lists" clickable="true">
                          <ViewGroup id="140" clickable="false" />
                          <ImageView id="141" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                        <FrameLayout id="142" content-desc="History" clickable="true">
                          <ViewGroup id="143" clickable="false" />
                          <ImageView id="144" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                        <FrameLayout id="145" content-desc="Nearby" clickable="true">
                          <ViewGroup id="146" clickable="false" />
                          <ImageView id="147" resource-id="org.wikipedia.alpha:id/icon" clickable="false" />
                        </FrameLayout>
                      </ViewGroup>
                    </FrameLayout>
                  </LinearLayout>
                </FrameLayout>
              </FrameLayout>
              <ViewGroup id="148" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar" clickable="false">
                <ImageView id="149" resource-id="org.wikipedia.alpha:id/single_fragment_toolbar_wordmark" clickable="false" />
                <LinearLayoutCompat id="150" clickable="false">
                  <TextView id="151" resource-id="org.wikipedia.alpha:id/menu_overflow_button" content-desc="More options" clickable="true" />
                </LinearLayoutCompat>
              </ViewGroup>
            </FrameLayout>
          </FrameLayout>
        </FrameLayout>
      </FrameLayout>
    </LinearLayout>
    <View id="152" resource-id="android:id/navigationBarBackground" clickable="false" />
  </FrameLayout>
</hierarchy>"""

    actual_output = (simple_tree.to_xml()).strip()
    expected_output = expected_output.strip()
    assert actual_output == expected_output
