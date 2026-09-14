from asyncio import sleep as async_sleep
from os import getenv
from pathlib import Path
from time import monotonic, sleep
from typing import Callable

from .cdp_network_monitor import CdpNetworkMonitor

with open(Path(__file__).parent / "scripts/waiter.js") as waiter_file:
    WAITER_SCRIPT = waiter_file.read()

WAITER_SNAPSHOT_SCRIPT = "window[Symbol.for('alumnium')]?.snapshot()"
WAITER_IDLE_SECONDS = int(getenv("ALUMNIUM_WAITER_IDLE_MS", "25")) / 1000
WAITER_TIMEOUT_SECONDS = int(getenv("ALUMNIUM_WAITER_TIMEOUT_MS", "10000")) / 1000
WAITER_POLL_SECONDS = 0.01


def wait_for_page_to_load(
    monitor: CdpNetworkMonitor,
    snapshot: Callable[[], dict | None],
    idle: float = WAITER_IDLE_SECONDS,
    timeout: float = WAITER_TIMEOUT_SECONDS,
) -> tuple[bool, list[str]]:
    started_at = monotonic()
    deadline = started_at + timeout
    pending: list[str] = []

    while monotonic() < deadline:
        pending = monitor.pending()
        if not pending and monotonic() - started_at >= idle and monitor.idle_for >= idle:
            state = snapshot()
            if (
                state
                and state.get("readyState") == "complete"
                and (state.get("now", 0) - state.get("lastMutationAt", 0)) / 1000 >= idle
                and not state.get("pendingTimeouts", 0)
                and not monitor.pending()
            ):
                return True, []
        sleep(WAITER_POLL_SECONDS)

    return False, pending


async def wait_for_page_to_load_async(
    monitor: CdpNetworkMonitor,
    snapshot: Callable,
    idle: float = WAITER_IDLE_SECONDS,
    timeout: float = WAITER_TIMEOUT_SECONDS,
) -> tuple[bool, list[str]]:
    started_at = monotonic()
    deadline = started_at + timeout
    pending: list[str] = []

    while monotonic() < deadline:
        pending = monitor.pending()
        if not pending and monotonic() - started_at >= idle and monitor.idle_for >= idle:
            state = await snapshot()
            if (
                state
                and state.get("readyState") == "complete"
                and (state.get("now", 0) - state.get("lastMutationAt", 0)) / 1000 >= idle
                and not state.get("pendingTimeouts", 0)
                and not monitor.pending()
            ):
                return True, []
        await async_sleep(WAITER_POLL_SECONDS)

    return False, pending
