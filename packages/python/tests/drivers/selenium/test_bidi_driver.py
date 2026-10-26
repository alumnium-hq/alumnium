from typing import cast

from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.drivers.selenium.bidi_driver import (
    CONTEXT_CREATED_EVENT,
    NAVIGATION_STARTED_EVENT,
    BiDiDriver,
)


class Connection:
    def __init__(self):
        self.methods: list[str] = []
        self.callbacks: dict[str, list] = {}

    def execute(self, command):
        payload = next(command)
        self.methods.append(payload["method"])
        try:
            command.send({})
        except StopIteration as exit:
            return exit.value

    def add_callback(self, event, callback):
        self.callbacks.setdefault(event.event_class, []).append(lambda params: callback(event.from_json(params)))


class Driver:
    capabilities = {"browserName": "firefox", "webSocketUrl": "ws://localhost"}

    def __init__(self):
        self._websocket_connection = Connection()
        self.quit_calls = 0

    def quit(self):
        self.quit_calls += 1


def test_installs_waiter_before_subscribing_to_navigation_events():
    webdriver = Driver()
    driver = BiDiDriver(cast(WebDriver, webdriver))
    driver.quit()

    methods = webdriver._websocket_connection.methods
    assert methods[0] == "script.addPreloadScript"
    assert "session.subscribe" in methods
    assert methods[-1] == "script.addPreloadScript"
    assert webdriver.quit_calls == 1


def test_waits_for_navigation_finished_out_of_order():
    webdriver = Driver()
    driver = BiDiDriver(cast(WebDriver, webdriver))
    callbacks = webdriver._websocket_connection.callbacks

    def action():
        # Load is handled before the navigation start, as callbacks run in threads
        callbacks["browsingContext.load"][0]({"context": "tab", "navigation": "nav"})
        callbacks[NAVIGATION_STARTED_EVENT][0]({"context": "tab", "navigation": "nav"})
        callbacks[CONTEXT_CREATED_EVENT][0]({"context": "new-tab"})
        return "done"

    assert driver._with_navigation_wait(action) == "done"
    assert driver._pending_navigations() == 0


def test_ignores_navigation_events_outside_actions():
    webdriver = Driver()
    driver = BiDiDriver(cast(WebDriver, webdriver))
    callbacks = webdriver._websocket_connection.callbacks

    callbacks[NAVIGATION_STARTED_EVENT][0]({"context": "tab", "navigation": "nav"})

    assert driver._pending_navigations() == 0
