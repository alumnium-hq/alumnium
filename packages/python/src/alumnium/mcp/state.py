"""State management for MCP server driver instances."""

from pathlib import Path
from typing import Any

from .. import Alumni

# Global state for driver management
drivers: dict[str, tuple[Alumni, Any]] = {}  # driver_id -> (Alumni instance, raw driver)
screenshot_dirs: dict[str, Path] = {}  # driver_id -> screenshot directory path
step_counters: dict[str, int] = {}  # driver_id -> current step number


def register_driver(driver_id: str, al: Alumni, raw_driver: Any, screenshot_dir: Path) -> None:
    """Register a new driver instance."""
    drivers[driver_id] = (al, raw_driver)
    screenshot_dirs[driver_id] = screenshot_dir
    step_counters[driver_id] = 1


def get_driver(driver_id: str) -> tuple[Alumni, Any]:
    """Get driver instance by ID."""
    if driver_id not in drivers:
        raise ValueError(f"Driver {driver_id} not found. Call alumnium_start_driver first.")
    return drivers[driver_id]


def cleanup_driver(driver_id: str) -> tuple[Path, dict[str, Any]]:
    """Clean up driver and return screenshot directory and stats."""
    if driver_id not in drivers:
        raise ValueError(f"Driver {driver_id} not found.")

    al, _ = drivers[driver_id]
    stats = al.stats
    screenshot_dir = screenshot_dirs[driver_id]

    # Quit the Alumni driver (closes page)
    al.quit()

    # Additional cleanup for Playwright driver (browser/context/playwright/thread)
    driver_obj = al.driver
    if hasattr(driver_obj, "_playwright_instance"):
        import asyncio

        # Close resources in the shared event loop
        async def _cleanup_resources():
            if hasattr(driver_obj, "_context_instance"):
                await driver_obj._context_instance.close()
            if hasattr(driver_obj, "_browser_instance"):
                await driver_obj._browser_instance.close()
            if hasattr(driver_obj, "_playwright_instance"):
                await driver_obj._playwright_instance.stop()

        future = asyncio.run_coroutine_threadsafe(_cleanup_resources(), driver_obj._loop)
        future.result()

        # Stop event loop and thread
        if hasattr(driver_obj, "_loop"):
            driver_obj._loop.call_soon_threadsafe(driver_obj._loop.stop)
        if hasattr(driver_obj, "_thread"):
            driver_obj._thread.join(timeout=5)

    del drivers[driver_id]
    del screenshot_dirs[driver_id]
    del step_counters[driver_id]

    return screenshot_dir, stats
