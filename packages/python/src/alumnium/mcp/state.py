"""State management for MCP server driver instances."""

import atexit
import json
from pathlib import Path
from typing import Any

from .. import Alumni
from ..server.logutils import get_logger

logger = get_logger(__name__)

# Global state for driver management
drivers: dict[str, tuple[Alumni, Any]] = {}  # driver_id -> (Alumni instance, raw driver)
artifacts_dirs: dict[str, Path] = {}  # driver_id -> artifacts directory path
step_counters: dict[str, int] = {}  # driver_id -> current step number


def _cleanup_all_drivers() -> None:
    """Stop all active drivers on process exit."""
    for driver_id in list(drivers.keys()):
        logger.info(f"Exit hook: stopping driver {driver_id}")
        try:
            cleanup_driver(driver_id)
        except Exception as e:
            logger.warning(f"Exit hook: error stopping driver {driver_id}: {e}")


atexit.register(_cleanup_all_drivers)


def register_driver(driver_id: str, al: Alumni, raw_driver: Any, artifacts_dir: Path) -> None:
    """Register a new driver instance."""
    drivers[driver_id] = (al, raw_driver)
    artifacts_dirs[driver_id] = artifacts_dir
    step_counters[driver_id] = 1
    logger.debug(f"Registered driver {driver_id} in state")


def get_driver(driver_id: str) -> tuple[Alumni, Any]:
    """Get driver instance by ID."""
    if driver_id not in drivers:
        logger.error(f"Driver {driver_id} not found")
        raise ValueError(f"Driver {driver_id} not found. Call start_driver first.")
    return drivers[driver_id]


def cleanup_driver(driver_id: str) -> tuple[Path, dict[str, Any]]:
    """Clean up driver and return artifacts directory and stats."""
    if driver_id not in drivers:
        logger.error(f"Driver {driver_id} not found for cleanup")
        raise ValueError(f"Driver {driver_id} not found.")

    logger.debug(f"Cleaning up driver {driver_id}")

    al, driver = drivers[driver_id]
    stats = al.stats
    artifacts_dir = artifacts_dirs[driver_id]

    if isinstance(driver, tuple) and driver[0].__class__.__name__ == "Page":
        # Playwright driver
        import asyncio

        page, loop = driver

        logger.debug(f"Driver {driver_id}: Stopping Playwright tracing")

        async def _stop_tracing():
            await page.context.tracing.stop(path=str(artifacts_dir / "trace.zip"))

        future = asyncio.run_coroutine_threadsafe(_stop_tracing(), loop)
        future.result()

    al.quit()

    del drivers[driver_id]
    del artifacts_dirs[driver_id]
    del step_counters[driver_id]

    # Save token stats to JSON file
    stats_file = artifacts_dir / "token-stats.json"
    with open(stats_file, "w") as f:
        json.dump(stats, f, indent=2)
    logger.info(
        f"Driver {driver_id}: Token stats saved to {stats_file}. "
        f"Total tokens: {stats['total']['total_tokens']}, "
        f"Cached tokens: {stats['cache']['total_tokens']}"
    )

    logger.debug(f"Driver {driver_id} cleanup complete")

    return artifacts_dir, stats
