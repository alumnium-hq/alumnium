from unittest.mock import MagicMock, patch

import pytest

from alumnium.clients.http_client import HttpClient
from alumnium.learn import Learn


def learn() -> Learn:
    driver = MagicMock()
    driver.app = "example-com"
    return Learn(MagicMock(), driver)


def test_teaches_do_when_called_directly():
    subject = learn()
    subject("log in", ["click button 'Login'"])
    subject.client.add_example.assert_called_once_with("log in", ["click button 'Login'"], app="example-com")


def test_teaches_do():
    subject = learn()
    subject.do("log in", ["click button 'Login'"])
    subject.client.add_example.assert_called_once_with("log in", ["click button 'Login'"], app="example-com")


@pytest.mark.parametrize("kind", ["get", "check", "find", "area"])
def test_teaches_hints(kind):
    subject = learn()
    getattr(subject, kind)("total", "use the 'Total' row")
    subject.client.add_hint.assert_called_once_with(kind, "total", "use the 'Total' row", app="example-com")


def test_add_hint_posts_hint():
    client = HttpClient.__new__(HttpClient)
    client.base_url = "http://localhost:8013"
    client.session_id = "session"
    with patch("alumnium.clients.http_client.post") as post:
        post.return_value.json.return_value = {"success": True}
        client.add_hint("get", "total", "use the 'Total' row", app="example-com")

    assert post.call_args.args[0] == "http://localhost:8013/v1/sessions/session/hints"
    assert post.call_args.kwargs["json"] == {
        "kind": "get",
        "instruction": "total",
        "hint": "use the 'Total' row",
        "app": "example-com",
    }
