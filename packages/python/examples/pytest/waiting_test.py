from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from os import getenv
from threading import Thread
from time import sleep

from pytest import fixture, mark


@fixture
def password_recovery_page(pages_dir):
    page = (pages_dir / "the-internet/forgot-password.html").read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(page)

        def do_POST(self):
            self.rfile.read(int(self.headers["Content-Length"]))
            sleep(0.5)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Your e-mail's been sent!")

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Synchronization is not implemented in Appium yet",
)
def test_waiting_for_loading_content(al, navigate):
    navigate("the-internet/dynamic-content.html")
    assert al.get("the total number of profile images") == 3


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Synchronization is not implemented in Appium yet",
)
def test_waiting_for_requests_and_form_updates(al, navigate, password_recovery_page):
    navigate(password_recovery_page)
    al.do("type test@example.com in the email field")
    al.do("click Retrieve password button")
    al.check("should see Your e-mail's been sent!")
