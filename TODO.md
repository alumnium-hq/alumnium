# TODO

## TypeScript Migration

- [ ] `.`
- [ ] `├── demo.py`

<details>
<summary><code>  ├── examples</code></summary>

- [ ] `│   ├── behave`
- [ ] `│   │   └── features`
- [ ] `│   │       ├── environment.py`
- [ ] `│   │       └── steps`
- [ ] `│   │           ├── todo_al.py`
- [ ] `│   │           └── todo_webdriver.py`
- [ ] `│   └── pytest`
- [ ] `│       ├── bstackdemo_test.py`
- [ ] `│       ├── calculator_test.py`
- [ ] `│       ├── conftest.py`
- [ ] `│       ├── drag_and_drop_test.py`
- [ ] `│       ├── execute_javascript_test.py`
- [ ] `│       ├── file_upload_test.py`
- [ ] `│       ├── frames_test.py`
- [ ] `│       ├── locator_test.py`
- [ ] `│       ├── navigation_test.py`
- [ ] `│       ├── search_test.py`
- [ ] `│       ├── select_test.py`
- [ ] `│       ├── swag_labs_test.py`
- [ ] `│       ├── table_test.py`
- [ ] `│       ├── tabs_test.py`
- [ ] `│       └── waiting_test.py`

</details>

- [ ] `├── src`
- [ ] `│   └── alumnium`
- [ ] `│       ├── __init__.py`
- [ ] `│       ├── accessibility`
- [ ] `│       │   ├── __init__.py`
- [ ] `│       │   ├── accessibility_element.py`
- [ ] `│       │   ├── base_accessibility_tree.py`
- [ ] `│       │   ├── chromium_accessibility_tree.py`
- [ ] `│       │   ├── uiautomator2_accessibility_tree.py`
- [ ] `│       │   └── xcuitest_accessibility_tree.py`
- [ ] `│       ├── alumni.py`
- [ ] `│       ├── area.py`
- [ ] `│       ├── cache.py`
- [ ] `│       ├── clients`
- [ ] `│       │   ├── __init__.py`
- [ ] `│       │   ├── http_client.py`
- [ ] `│       │   ├── native_client.py`
- [ ] `│       │   └── typecasting.py`
- [ ] `│       ├── drivers`
- [ ] `│       │   ├── __init__.py`
- [ ] `│       │   ├── appium_driver.py`
- [ ] `│       │   ├── base_driver.py`
- [ ] `│       │   ├── keys.py`
- [ ] `│       │   ├── playwright_async_driver.py`
- [ ] `│       │   ├── playwright_driver.py`
- [ ] `│       │   └── selenium_driver.py`
- [ ] `│       ├── mcp`
- [ ] `│       │   ├── __init__.py`
- [ ] `│       │   ├── drivers.py`
- [ ] `│       │   ├── handlers.py`
- [ ] `│       │   ├── screenshots.py`
- [ ] `│       │   ├── server.py`
- [ ] `│       │   ├── state.py`
- [ ] `│       │   └── tools.py`
- [ ] `│       ├── result.py`
- [ ] `│       ├── server`
- [ ] `│       │   ├── __init__.py`
- [ ] `│       │   ├── accessibility`
- [ ] `│       │   │   ├── __init__.py`
- [ ] `│       │   │   ├── accessibility_tree_diff.py`
- [ ] `│       │   │   ├── base_server_accessibility_tree.py`
- [ ] `│       │   │   ├── server_chromium_accessibility_tree.py`
- [ ] `│       │   │   ├── server_uiautomator2_accessibility_tree.py`
- [ ] `│       │   │   └── server_xcuitest_accessibility_tree.py`
- [ ] `│       │   ├── agents`
- [ ] `│       │   │   ├── __init__.py`
- [ ] `│       │   │   ├── actor_agent.py`
- [ ] `│       │   │   ├── area_agent.py`
- [ ] `│       │   │   ├── base_agent.py`
- [ ] `│       │   │   ├── changes_analyzer_agent.py`
- [ ] `│       │   │   ├── locator_agent.py`
- [ ] `│       │   │   ├── planner_agent.py`
- [ ] `│       │   │   └── retriever_agent.py`
- [ ] `│       │   ├── api_models.py`
- [ ] `│       │   ├── cache`
- [ ] `│       │   │   ├── filesystem_cache.py`
- [ ] `│       │   │   ├── null_cache.py`
- [ ] `│       │   │   └── sqlite_cache.py`
- [ ] `│       │   ├── cache_factory.py`
- [ ] `│       │   ├── llm_factory.py`
- [ ] `│       │   ├── logutils.py`
- [ ] `│       │   ├── main.py`
- [ ] `│       │   ├── models.py`
- [ ] `│       │   ├── schema_to_tool_converter.py`
- [ ] `│       │   ├── session.py`
- [ ] `│       │   └── session_manager.py`
- [ ] `│       └── tools`
- [ ] `│           ├── __init__.py`
- [ ] `│           ├── base_tool.py`
- [ ] `│           ├── click_tool.py`
- [ ] `│           ├── drag_and_drop_tool.py`
- [ ] `│           ├── execute_javascript_tool.py`
- [ ] `│           ├── hover_tool.py`
- [ ] `│           ├── navigate_back_tool.py`
- [ ] `│           ├── navigate_to_url_tool.py`
- [ ] `│           ├── press_key_tool.py`
- [ ] `│           ├── scroll_tool.py`
- [ ] `│           ├── switch_to_next_tab_tool.py`
- [ ] `│           ├── switch_to_previous_tab_tool.py`
- [ ] `│           ├── tool_to_schema_converter.py`
- [ ] `│           ├── type_tool.py`
- [ ] `│           └── upload_tool.py`

<details>
<summary><code>  └── tests</code></summary>

- [ ] `    ├── accessibility`
- [ ] `    │   ├── test_chromium_accessibilty_tree.py`
- [ ] `    │   ├── test_uiautomator2_accessibility_tree.py`
- [ ] `    │   └── test_xcuitest_accessibilty_tree.py`
- [ ] `    ├── mcp`
- [ ] `    │   └── test_handlers.py`
- [ ] `    ├── server`
- [ ] `    │   ├── accessibility`
- [ ] `    │   │   ├── test_accessibility_tree_diff.py`
- [ ] `    │   │   ├── test_server_chromium_accessibilty_tree.py`
- [ ] `    │   │   ├── test_server_uiautomator2_accessibility_tree.py`
- [ ] `    │   │   └── test_server_xcuitest_accessibilty_tree.py`
- [ ] `    │   ├── cache`
- [ ] `    │   │   └── test_filesystem_cache.py`
- [ ] `    │   └── test_server.py`
- [ ] `    └── tools`
- [ ] `        └── test_tool_to_schema_converter.py`

</details>
