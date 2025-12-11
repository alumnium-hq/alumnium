"""State management for MCP server driver instances."""

from pathlib import Path
from typing import Any

from .. import Alumni
from ..server.logutils import get_logger

logger = get_logger(__name__)

# Global state for driver management
drivers: dict[str, tuple[Alumni, Any]] = {}  # driver_id -> (Alumni instance, raw driver)
screenshot_dirs: dict[str, Path] = {}  # driver_id -> screenshot directory path
step_counters: dict[str, int] = {}  # driver_id -> current step number


def register_driver(driver_id: str, al: Alumni, raw_driver: Any, screenshot_dir: Path) -> None:
    """Register a new driver instance."""
    drivers[driver_id] = (al, raw_driver)
    screenshot_dirs[driver_id] = screenshot_dir
    step_counters[driver_id] = 1
    logger.debug(f"Registered driver {driver_id} in state")


def get_driver(driver_id: str) -> tuple[Alumni, Any]:
    """Get driver instance by ID."""
    if driver_id not in drivers:
        logger.error(f"Driver {driver_id} not found")
        raise ValueError(f"Driver {driver_id} not found. Call alumnium_start_driver first.")
    return drivers[driver_id]


def cleanup_driver(driver_id: str) -> tuple[Path, dict[str, Any]]:
    """Clean up driver and return screenshot directory and stats."""
    if driver_id not in drivers:
        logger.error(f"Driver {driver_id} not found for cleanup")
        raise ValueError(f"Driver {driver_id} not found.")

    logger.debug(f"Cleaning up driver {driver_id}")

    al, driver = drivers[driver_id]
    stats = al.stats
    screenshot_dir = screenshot_dirs[driver_id]

    if isinstance(driver, tuple) and driver[0].__class__.__name__ == "Page":
        # Playwright driver
        import asyncio

        page, loop = driver

        logger.debug(f"Driver {driver_id}: Stopping Playwright tracing")

        async def _stop_tracing():
            await page.context.tracing.stop(path=str(screenshot_dir / "trace.zip"))

        future = asyncio.run_coroutine_threadsafe(_stop_tracing(), loop)
        future.result()

    al.quit()

    del drivers[driver_id]
    del screenshot_dirs[driver_id]
    del step_counters[driver_id]

    logger.debug(f"Driver {driver_id} cleanup complete")

    return screenshot_dir, stats
