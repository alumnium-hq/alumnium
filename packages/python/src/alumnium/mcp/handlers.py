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
    result = al.do(goal)

    logger.debug(f"Driver {driver_id}: do() completed with {len(result.steps)} steps")
    screenshots.save_screenshot(driver_id, goal, al)

    # Format the result with explanation and steps
    response_text = f"{result.explanation}\n"
    if not result.steps:
        response_text += "Steps performed: None"
    else:
        response_text += "Steps performed:\n"
        for idx, step in enumerate(result.steps, 1):
            response_text += f"{idx}. {step.name} ({', '.join(step.tools)})\n"

    return [{"type": "text", "text": response_text}]


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
