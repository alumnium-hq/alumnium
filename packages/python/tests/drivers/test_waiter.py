from alumnium.drivers.waiter import wait_for_page_to_load


def snapshot(**state) -> dict:
    return {
        "lastMutationAt": 0,
        "lastRequestAt": 0,
        "now": 100,
        "pendingRequests": [],
        "pendingTimeouts": 0,
        "readyState": "complete",
        **state,
    }


def test_waits_for_short_timeouts():
    calls = 0

    def timer_snapshot():
        nonlocal calls
        calls += 1
        return snapshot(pendingTimeouts=1 if calls == 1 else 0)

    loaded, pending = wait_for_page_to_load(timer_snapshot, idle=0, timeout=0.1)

    assert loaded
    assert pending == []
    assert calls == 2


def test_waits_for_requests_reported_by_snapshot():
    loaded, pending = wait_for_page_to_load(
        lambda: snapshot(pendingRequests=["https://example.com/slow"]),
        idle=0.025,
        timeout=0.1,
    )

    assert not loaded
    assert pending == ["https://example.com/slow"]


def test_waits_for_network_to_stay_quiet_after_request():
    loaded, _ = wait_for_page_to_load(lambda: snapshot(lastRequestAt=90), idle=0.025, timeout=0.1)

    assert not loaded
