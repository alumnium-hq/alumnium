from alumnium.drivers.selenium_driver import SeleniumDriver
from alumnium.drivers.waiter import WAITER_SCRIPT, WAITER_SNAPSHOT_SCRIPT


def test_injects_waiter_when_new_tab_session_is_not_ready():
    selenium = object.__new__(SeleniumDriver)
    snapshot = {
        "lastMutationAt": 0,
        "now": 100,
        "pendingTimeouts": 0,
        "readyState": "complete",
    }
    results = [None, None, snapshot]
    scripts = []

    class Driver:
        def execute_script(self, script):
            scripts.append(script)
            return results.pop(0)

    selenium.driver = Driver()

    assert selenium._waiter_snapshot() == snapshot
    assert scripts == [f"return {WAITER_SNAPSHOT_SCRIPT}", WAITER_SCRIPT, f"return {WAITER_SNAPSHOT_SCRIPT}"]
