"""Tool handlers for MCP server."""

import json
import os
from datetime import datetime
from os import getenv
from pathlib import Path
from typing import Any

from .. import Alumni
from ..clients.native_client import NativeClient
from ..server.logutils import get_logger
from ..tools import ExecuteJavascriptTool, NavigateBackTool, NavigateToUrlTool, ScrollTool
from . import drivers, screenshots, state

logger = get_logger(__name__)

# Base directory for MCP artifacts (screenshots, logs, etc.)
# Defaults to OS temp directory, can be configured via environment variable
ARTIFACTS_DIR = Path(getenv("ALUMNIUM_MCP_ARTIFACTS_DIR", str("tmp/alumnium")))


async def handle_start_driver(args: dict[str, Any]) -> list[dict]:
    """Start a new driver instance."""
    # Parse capabilities JSON
    try:
        capabilities = json.loads(args["capabilities"])
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in capabilities parameter: {e}")
        raise ValueError(f"Invalid JSON in capabilities parameter: {e}")

    # Extract and validate platformName
    if "platformName" not in capabilities:
        logger.error("capabilities must include 'platformName' field")
        raise ValueError("capabilities must include 'platformName' field")

    platform_name = capabilities["platformName"].lower()
    server_url = args.get("server_url")

    # Extract alumnium:options for Alumnium driver configuration
    alumnium_options = capabilities.pop("alumnium:options", {})
    driver_settings = alumnium_options.get("driverSettings", {})

    # Generate driver ID from current directory and timestamp
    cwd_name = os.path.basename(os.getcwd())
    timestamp = int(datetime.now().timestamp())
    driver_id = f"{cwd_name}-{timestamp}"

    logger.info(f"Starting driver {driver_id} for platform: {platform_name}")

    # Create artifacts directories
    artifacts_dir = ARTIFACTS_DIR / driver_id
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    # Detect platform and create appropriate driver
    if platform_name in ["chrome", "chromium"]:
        driver = drivers.create_chrome_driver(capabilities, server_url, artifacts_dir)
        platform_label = "Chrome"
    elif platform_name == "ios":
        driver = drivers.create_ios_driver(capabilities, server_url)
        platform_label = "iOS"
    elif platform_name == "android":
        driver = drivers.create_android_driver(capabilities, server_url)
        platform_label = "Android"
    else:
        logger.error(f"Unsupported platformName: {platform_name}")
        raise ValueError(
            f"Unsupported platformName: {platform_name}. Supported values: chrome, chromium, ios, android"
        )

    al = Alumni(
        driver,
        extra_tools=[
            ExecuteJavascriptTool,
            NavigateBackTool,
            NavigateToUrlTool,
            ScrollTool,
        ],
    )

    # Apply driver options to Alumnium driver
    if driver_settings:
        logger.debug(f"Applying driver options: {driver_settings}")
        for key, value in driver_settings.items():
            # Convert camelCase to snake_case
            snake_key = "".join(["_" + c.lower() if c.isupper() else c for c in key]).lstrip("_")
            if hasattr(al.driver, snake_key):
                setattr(al.driver, snake_key, value)
                logger.debug(f"Set driver option {snake_key}={value}")
            else:
                logger.warning(f"Unknown driver option: {key}")

    # Register driver in global state
    state.register_driver(driver_id, al, driver, artifacts_dir)

    logger.info(
        f"Driver {driver_id} started successfully. Platform: {platform_label}, "
        f"Model: {al.model.provider.value}/{al.model.name}"
    )

    return [
        {
            "type": "text",
            "text": (
                f"{platform_label} driver started successfully (driver_id: {driver_id})\n"
                f"Model: {al.model.provider.value}/{al.model.name}"
            ),
        }
    ]


async def handle_do(args: dict[str, Any]) -> list[dict]:
    """Execute Alumni.do()."""
    driver_id = args["driver_id"]
    goal = args["goal"]

    logger.info(f"Driver {driver_id}: Executing do('{goal}')")

    al, _ = state.get_driver(driver_id)
    client: NativeClient = al.client  # type: ignore
    before_tree = al.driver.accessibility_tree.to_str()
    before_url = al.driver.url
    result = al.do(goal)

    logger.debug(f"Driver {driver_id}: do() completed with {len(result.steps)} steps")
    screenshots.save_screenshot(driver_id, goal, al)

    # Build structured response
    performed_steps = [{"name": step.name, "tools": step.tools} for step in result.steps]

    changes = ""
    if result.steps:
        try:
            after_tree = al.driver.accessibility_tree.to_str()
            after_url = al.driver.url
            changes = client.analyze_changes(
                before_accessibility_tree=before_tree,
                before_url=before_url,
                after_accessibility_tree=after_tree,
                after_url=after_url,
            )
        except Exception as e:
            logger.error(f"Driver {driver_id}: Error analyzing changes: {e}")

    response = {
        "explanation": result.explanation,
        "performed_steps": performed_steps,
    }
    if changes:
        response["changes"] = changes

    return [{"type": "text", "text": json.dumps(response, indent=2, ensure_ascii=False)}]


async def handle_check(args: dict[str, Any]) -> list[dict]:
    """Execute Alumni.check()."""
    driver_id = args["driver_id"]
    statement = args["statement"]
    vision = args.get("vision", False)

    logger.info(f"Driver {driver_id}: Executing check('{statement}', vision={vision})")

    al, _ = state.get_driver(driver_id)
    try:
        explanation = al.check(statement, vision=vision)
        result = "passed"
        logger.debug(f"Driver {driver_id}: check() passed: {explanation}")
    except AssertionError as e:
        explanation = str(e)
        result = "failed"
        logger.debug(f"Driver {driver_id}: check() failed: {explanation}")

    screenshots.save_screenshot(driver_id, f"check {statement}", al)

    return [{"type": "text", "text": f"Check {result}! {explanation}"}]


async def handle_get(args: dict[str, Any]) -> list[dict]:
    """Execute Alumni.get()."""
    driver_id = args["driver_id"]
    data = args["data"]
    vision = args.get("vision", False)

    logger.info(f"Driver {driver_id}: Executing get('{data}', vision={vision})")

    al, _ = state.get_driver(driver_id)
    result = al.get(data, vision=vision)
    logger.debug(f"Driver {driver_id}: get() extracted data: {result}")
    screenshots.save_screenshot(driver_id, f"get {data}", al)

    return [{"type": "text", "text": str(result)}]


async def handle_fetch_accessibility_tree(args: dict[str, Any]) -> list[dict]:
    """Fetch accessibility tree for debugging."""
    driver_id = args["driver_id"]

    logger.debug(f"Driver {driver_id}: Getting accessibility tree")

    al, _ = state.get_driver(driver_id)
    # Access the internal driver's accessibility tree
    # as if it's processed by Alumnium server
    client: NativeClient = al.client  # type: ignore
    tree = client.session.process_tree(al.driver.accessibility_tree.to_str())  # type: ignore

    return [{"type": "text", "text": f"Accessibility Tree:\n{tree.to_xml()}"}]


async def handle_stop_driver(args: dict[str, Any]) -> list[dict]:
    """Stop driver and cleanup."""
    driver_id = args["driver_id"]
    save_cache = args.get("save_cache", False)

    logger.info(f"Driver {driver_id}: Stopping driver (save_cache={save_cache})")

    # Save cache if requested
    if save_cache:
        al, _ = state.get_driver(driver_id)
        al.cache.save()
        logger.info(f"Driver {driver_id}: Cache saved")

    # Cleanup driver and get stats
    artifacts_dir, stats = state.cleanup_driver(driver_id)

    # Save token stats to JSON file
    stats_file = artifacts_dir / "token-stats.json"
    with open(stats_file, "w") as f:
        json.dump(stats, f, indent=2)
    logger.info(f"Driver {driver_id}: Token stats saved to {stats_file}")

    logger.info(
        f"Driver {driver_id}: Closed. Total tokens: {stats['total']['total_tokens']}, "
        f"Cached tokens: {stats['cache']['total_tokens']}"
    )

    # Format stats message with detailed cache breakdown
    message = (
        f"Driver {driver_id} closed.\n"
        f"Artifacts saved to: {artifacts_dir.resolve()}\n"
        f"Token usage statistics:\n"
        f"- Total: {stats['total']['total_tokens']} tokens "
        f"({stats['total']['input_tokens']} input, {stats['total']['output_tokens']} output)\n"
        f"- Cached: {stats['cache']['total_tokens']} tokens "
        f"({stats['cache']['input_tokens']} input, {stats['cache']['output_tokens']} output)"
    )

    return [{"type": "text", "text": message}]


async def handle_list_tabs(args: dict[str, Any]) -> list[dict]:
    """List all open browser tabs/windows."""
    import asyncio

    driver_id = args["driver_id"]

    logger.debug(f"Driver {driver_id}: Listing tabs")

    al, raw_driver = state.get_driver(driver_id)

    # Check if this is a Playwright driver
    if not (isinstance(raw_driver, tuple) and raw_driver[0].__class__.__name__ == "Page"):
        return [{"type": "text", "text": "Tab management is currently only supported for Playwright drivers"}]

    page, loop = raw_driver

    async def _list_pages():
        context = page.context
        pages = context.pages
        tabs = []
        for i, p in enumerate(pages):
            title = await p.title()
            tabs.append({
                "index": i,
                "title": title,
                "url": p.url,
                "is_active": p == al.driver.page,
            })
        return tabs

    future = asyncio.run_coroutine_threadsafe(_list_pages(), loop)
    tabs = future.result()

    logger.info(f"Driver {driver_id}: Found {len(tabs)} tabs")

    # Format as readable text
    lines = [f"Found {len(tabs)} open tab(s):"]
    for tab in tabs:
        active = " (active)" if tab["is_active"] else ""
        lines.append(f"  [{tab['index']}] {tab['title']}{active}")
        lines.append(f"      URL: {tab['url']}")

    return [{"type": "text", "text": "\n".join(lines)}]


async def handle_switch_tab(args: dict[str, Any]) -> list[dict]:
    """Switch to a different browser tab/window."""
    import asyncio

    driver_id = args["driver_id"]
    tab_index = args["tab_index"]

    logger.info(f"Driver {driver_id}: Switching to tab {tab_index}")

    al, raw_driver = state.get_driver(driver_id)

    # Check if this is a Playwright driver
    if not (isinstance(raw_driver, tuple) and raw_driver[0].__class__.__name__ == "Page"):
        return [{"type": "text", "text": "Tab management is currently only supported for Playwright drivers"}]

    page, loop = raw_driver

    async def _switch_tab():
        context = page.context
        pages = context.pages

        if tab_index < 0 or tab_index >= len(pages):
            raise ValueError(f"Invalid tab index {tab_index}. Available: 0-{len(pages)-1}")

        target_page = pages[tab_index]
        al.driver.page = target_page
        # Reset CDP client for new page
        al.driver.client = None

        title = await target_page.title()
        return title, target_page.url

    future = asyncio.run_coroutine_threadsafe(_switch_tab(), loop)
    title, url = future.result()

    logger.info(f"Driver {driver_id}: Switched to tab {tab_index}: {title}")

    return [{"type": "text", "text": f"Switched to tab [{tab_index}]: {title}\nURL: {url}"}]


async def handle_wait(args: dict[str, Any]) -> list[dict]:
    """Wait for a specified number of seconds."""
    import asyncio

    seconds = args["seconds"]

    # Clamp to valid range
    seconds = max(1, min(30, seconds))

    logger.info(f"Waiting for {seconds} seconds")
    await asyncio.sleep(seconds)

    return [{"type": "text", "text": f"Waited {seconds} seconds"}]


async def handle_wait_for_element(args: dict[str, Any]) -> list[dict]:
    """Wait for an element to appear on the page."""
    import asyncio

    driver_id = args["driver_id"]
    selector = args["selector"]
    timeout = args.get("timeout", 10)

    logger.info(f"Driver {driver_id}: Waiting for element '{selector}' (timeout={timeout}s)")

    al, raw_driver = state.get_driver(driver_id)

    # Check if this is a Playwright driver
    if not (isinstance(raw_driver, tuple) and raw_driver[0].__class__.__name__ == "Page"):
        return [{"type": "text", "text": "wait_for_element is currently only supported for Playwright drivers"}]

    page, loop = raw_driver

    async def _wait_for_element():
        # Use the current page from the driver (in case it was switched)
        current_page = al.driver.page
        await current_page.wait_for_selector(selector, timeout=timeout * 1000)
        return True

    try:
        future = asyncio.run_coroutine_threadsafe(_wait_for_element(), loop)
        future.result()
        logger.info(f"Driver {driver_id}: Element '{selector}' found")
        return [{"type": "text", "text": f"Element found: {selector}"}]
    except Exception as e:
        logger.warning(f"Driver {driver_id}: Timeout waiting for '{selector}': {e}")
        return [{"type": "text", "text": f"Timeout after {timeout}s waiting for: {selector}"}]
