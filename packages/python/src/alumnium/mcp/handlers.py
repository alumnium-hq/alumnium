"""Tool handlers for MCP server."""

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from .. import Alumni
from ..clients.native_client import NativeClient
from ..tools import NavigateBackTool, NavigateToUrlTool, ScrollTool
from . import drivers, screenshots, state


async def handle_start_driver(args: dict[str, Any]) -> list[dict]:
    """Start a new driver instance."""
    # Parse capabilities JSON
    try:
        capabilities = json.loads(args["capabilities"])
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in capabilities parameter: {e}")

    # Extract and validate platformName
    if "platformName" not in capabilities:
        raise ValueError("capabilities must include 'platformName' field")

    platform_name = capabilities["platformName"].lower()
    server_url = args.get("server_url")

    # Detect platform and create appropriate driver
    if platform_name in ["chrome", "chromium"]:
        driver = drivers.create_chromium_driver(capabilities, server_url)
        platform_label = "Chromium"
    elif platform_name == "ios":
        driver = drivers.create_ios_driver(capabilities, server_url)
        platform_label = "iOS"
    elif platform_name == "android":
        driver = drivers.create_android_driver(capabilities, server_url)
        platform_label = "Android"
    else:
        raise ValueError(
            f"Unsupported platformName: {platform_name}. Supported values: chrome, chromium, ios, android"
        )

    al = Alumni(driver, extra_tools=[NavigateBackTool, NavigateToUrlTool, ScrollTool])

    # Generate unique driver ID
    driver_id = str(uuid4())

    # Create screenshot directory
    screenshot_dir = Path("tmp") / "alumnium" / driver_id
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    # Register driver in global state
    state.register_driver(driver_id, al, driver, screenshot_dir)

    return [
        {
            "type": "text",
            "text": (
                f"Driver started successfully. driver_id: {driver_id}\n"
                f"Platform: {platform_label}\n"
                f"Model: {al.model.provider.value}/{al.model.name}"
            ),
        }
    ]


async def handle_do(args: dict[str, Any]) -> list[dict]:
    """Execute Alumni.do()."""
    driver_id = args["driver_id"]
    goal = args["goal"]

    al, _ = state.get_driver(driver_id)
    result = al.do(goal)

    # Save screenshot after successful execution
    screenshots.save_screenshot(driver_id, goal, al)

    # Format the result with explanation and steps
    response_text = f"Explanation: {result.explanation}\n"
    if not result.steps:
        response_text += "Steps performed: None"
    else:
        response_text += "Steps performed:\n"
        for idx, step in enumerate(result.steps, 1):
            response_text += f"{idx}. {step.name}\n"
            if step.tools:
                for tool in step.tools:
                    response_text += f"   - {tool}\n"

    return [{"type": "text", "text": response_text}]


async def handle_check(args: dict[str, Any]) -> list[dict]:
    """Execute Alumni.check()."""
    driver_id = args["driver_id"]
    statement = args["statement"]
    vision = args.get("vision", False)

    al, _ = state.get_driver(driver_id)
    try:
        explanation = al.check(statement, vision=vision)
        result = True
    except AssertionError as e:
        explanation = str(e)
        result = False

    # Save screenshot after check
    screenshots.save_screenshot(driver_id, f"check {statement}", al)

    return [{"type": "text", "text": f"Result: {result}\nExplanation: {explanation}"}]


async def handle_get(args: dict[str, Any]) -> list[dict]:
    """Execute Alumni.get()."""
    driver_id = args["driver_id"]
    data = args["data"]
    vision = args.get("vision", False)

    al, _ = state.get_driver(driver_id)
    result = al.get(data, vision=vision)

    # Format the result with explanation and steps
    response_text = f"Extracted data: {result.data}\n"
    response_text += f"Explanation: {result.explanation}"

    # Save screenshot after get
    screenshots.save_screenshot(driver_id, f"get {data}", al)

    return [{"type": "text", "text": response_text}]


async def handle_get_accessibility_tree(args: dict[str, Any]) -> list[dict]:
    """Get accessibility tree for debugging."""
    driver_id = args["driver_id"]

    al, _ = state.get_driver(driver_id)
    # Access the internal driver's accessibility tree
    # as if it's processed by Alumnium server
    client: NativeClient = al.client  # type: ignore
    tree = client.session.process_tree(al.driver.accessibility_tree.to_str())  # type: ignore

    return [{"type": "text", "text": f"Accessibility Tree:\n{tree.to_xml()}"}]


async def handle_quit_driver(args: dict[str, Any]) -> list[dict]:
    """Quit driver and cleanup."""
    driver_id = args["driver_id"]

    # Cleanup driver and get stats
    screenshot_dir, stats = state.cleanup_driver(driver_id)

    # Format stats message with detailed cache breakdown
    message = (
        f"Driver {driver_id} closed successfully\n\n"
        f"Screenshots saved to: {screenshot_dir}\n\n"
        f"Token Usage Statistics:\n"
        f"- Total: {stats['total']['total_tokens']} tokens\n"
        f"  - Input: {stats['total']['input_tokens']}\n"
        f"  - Output: {stats['total']['output_tokens']}\n"
        f"- Cached: {stats['cache']['total_tokens']} tokens\n"
        f"  - Input: {stats['cache']['input_tokens']}\n"
        f"  - Output: {stats['cache']['output_tokens']}"
    )

    return [{"type": "text", "text": message}]


async def handle_save_cache(args: dict[str, Any]) -> list[dict]:
    """Save the cache for a driver session."""
    driver_id = args["driver_id"]

    al, _ = state.get_driver(driver_id)
    al.cache.save()

    return [{"type": "text", "text": f"Cache saved successfully for driver {driver_id}"}]
