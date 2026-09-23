from asyncio import sleep as async_sleep
from os import getenv
from pathlib import Path
from time import monotonic, sleep
from typing import Callable

with open(Path(__file__).parent / "scripts/waiter.js") as waiter_file:
    WAITER_SCRIPT = waiter_file.read()

WAITER_SNAPSHOT_SCRIPT = "window[Symbol.for('alumnium')]?.snapshot()"
WAITER_IDLE_SECONDS = int(getenv("ALUMNIUM_WAITER_IDLE_MS", "25")) / 1000
WAITER_TIMEOUT_SECONDS = int(getenv("ALUMNIUM_WAITER_TIMEOUT_MS", "10000")) / 1000
WAITER_POLL_SECONDS = 0.01


def wait_for_page_to_load(
    snapshot: Callable[[], dict | None],
    idle: float = WAITER_IDLE_SECONDS,
    timeout: float = WAITER_TIMEOUT_SECONDS,
    poll: Callable[[float], None] = sleep,
) -> tuple[bool, list[str]]:
    started_at = monotonic()
    deadline = started_at + timeout
    pending: list[str] = []

    while monotonic() < deadline:
        if monotonic() - started_at >= idle:
            state = snapshot()
            pending = state.get("pendingRequests", []) if state else []
            if state and _is_stable(state, idle):
                return True, []
        poll(WAITER_POLL_SECONDS)

    return False, pending


async def wait_for_page_to_load_async(
    snapshot: Callable,
    idle: float = WAITER_IDLE_SECONDS,
    timeout: float = WAITER_TIMEOUT_SECONDS,
) -> tuple[bool, list[str]]:
    started_at = monotonic()
    deadline = started_at + timeout
    pending: list[str] = []

    while monotonic() < deadline:
        if monotonic() - started_at >= idle:
            state = await snapshot()
            pending = state.get("pendingRequests", []) if state else []
            if state and _is_stable(state, idle):
                return True, []
        await async_sleep(WAITER_POLL_SECONDS)

    return False, pending


def _is_stable(state: dict, idle: float) -> bool:
    now = state.get("now", 0)
    last_activity_at = max(state.get("lastMutationAt", 0), state.get("lastRequestAt", 0))
    return (
        state.get("readyState") == "complete"
        and (now - last_activity_at) / 1000 >= idle
        and not state.get("pendingTimeouts", 0)
        and not state.get("pendingRequests")
    )
