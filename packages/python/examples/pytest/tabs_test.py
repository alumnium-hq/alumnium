from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from os import getenv
from threading import Thread
from time import sleep
from typing import Any

from pytest import fixture, mark

from alumnium.tools import SwitchToNextTabTool, SwitchToPreviousTabTool


@fixture
def slow_tab_page():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            is_slow_tab = self.path == "/slow-tab"
            if is_slow_tab:
                sleep(2)
            body = (
                b"<title>Slow Tab</title><h1>Slow Tab</h1>"
                if is_slow_tab
                else b"<title>Opener</title><h1>Opener</h1>"
                b"<button onclick=\"window.open('/slow-tab', '_blank')\">Open Slow Tab</button>"
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever)
    thread.start()
    port = server.server_address[1]
    yield f"http://127.0.0.1:{port}/", f"http://127.0.0.1:{port}/slow-tab"
    server.shutdown()
    thread.join()
    server.server_close()


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Appium doesn't support tab manipulation yet",
)
def test_switching_tabs(al_factory, navigate):
    al = al_factory(
        extra_tools=[
            SwitchToNextTabTool,
            SwitchToPreviousTabTool,
        ]
    )

    navigate("multi_tab_page.html")

    al.do("click on 'Open New Tab' button")
    assert al.get("current page URL") == "about:blank"

    al.do("switch to previous browser tab")
    assert al.get("header text") == "Multi-Tab Test Page"

    al.do("switch to next browser tab")
    assert al.get("current page URL") == "about:blank"

    al.do("switch to next browser tab")
    assert al.get("header text") == "Multi-Tab Test Page"

    al.do("switch to previous browser tab")
    assert al.get("current page URL") == "about:blank"


@mark.skipif(getenv("ALUMNIUM_DRIVER", "selenium") != "playwright", reason="Playwright-specific behavior")
def test_switches_to_a_tab_that_opens_slowly(al_factory, navigate, slow_tab_page):
    al = al_factory()
    url, slow_tab_url = slow_tab_page

    navigate(url)
    al.do("click on 'Open Slow Tab' button")

    assert al.driver.url == slow_tab_url
    assert al.get("header text") == "Slow Tab"
