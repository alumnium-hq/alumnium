from unittest.mock import MagicMock, patch

import pytest

from alumnium.clients.http_client import HttpClient
from alumnium.knowledge import Knowledge


def knowledge() -> tuple[Knowledge, MagicMock]:
    client = MagicMock()
    driver = MagicMock()
    driver.app = "example-com"
    return Knowledge(client, driver), client


def test_teaches_do():
    subject, client = knowledge()
    subject.do("log in", ["click button 'Login'"])
    client.add_example.assert_called_once_with("log in", ["click button 'Login'"], app="example-com", layer="product")


@pytest.mark.parametrize("kind", ["get", "check", "find", "area"])
def test_teaches_hints(kind):
    subject, client = knowledge()
    getattr(subject, kind)("total", "use the 'Total' row")
    client.add_hint.assert_called_once_with(kind, "total", "use the 'Total' row", app="example-com", layer="product")


def test_add_hint_posts_hint():
    client = HttpClient.__new__(HttpClient)
    client.base_url = "http://localhost:8013"
    client.session_id = "session"
    with patch("alumnium.clients.http_client.post") as post:
        post.return_value.json.return_value = {"success": True}
        client.add_hint("get", "total", "use the 'Total' row", app="example-com", layer="ios")

    assert post.call_args.args[0] == "http://localhost:8013/v1/sessions/session/hints"
    assert post.call_args.kwargs["json"] == {
        "kind": "get",
        "instruction": "total",
        "hint": "use the 'Total' row",
        "app": "example-com",
        "layer": "ios",
    }


def test_teaches_lessons_for_a_platform():
    subject, client = knowledge()
    subject = subject.on("android")
    subject.do("log in", ["tap 'Login'"])
    subject.find("login", "button 'Sign in'")
    client.add_example.assert_called_once_with("log in", ["tap 'Login'"], app="example-com", layer="android")
    client.add_hint.assert_called_once_with("find", "login", "button 'Sign in'", app="example-com", layer="android")


def test_teaches_shared_lessons():
    subject, client = knowledge()
    subject = subject.shared()
    subject.check("banner is gone", "no 'Accept' button")
    client.add_hint.assert_called_once_with(
        "check", "banner is gone", "no 'Accept' button", app="example-com", layer="shared"
    )


def test_forgets_lessons_in_a_layer():
    subject, client = knowledge()
    client.forget_lesson.return_value = True
    assert subject.forget("do", "log in") is True
    client.forget_lesson.assert_called_once_with("do", "log in", app="example-com", layer="product")


def test_purges_a_layer():
    subject, client = knowledge()
    subject = subject.on("web")
    subject.purge()
    client.clear_layer.assert_called_once_with(app="example-com", layer="web")


def test_forget_lesson_posts_lesson():
    client = HttpClient.__new__(HttpClient)
    client.base_url = "http://localhost:8013"
    client.session_id = "session"
    with patch("alumnium.clients.http_client.post") as post:
        post.return_value.json.return_value = {"forgotten": True}
        assert client.forget_lesson("find", "login", layer="web") is True

    assert post.call_args.args[0] == "http://localhost:8013/v1/sessions/session/lessons/forget"
    assert post.call_args.kwargs["json"] == {"kind": "find", "instruction": "login", "layer": "web"}


def test_teaches_lessons_for_the_named_app():
    subject, client = knowledge()
    todo = subject.app("todo.example.com")

    todo.do("log in", ["click button 'Login'"])
    todo.on("ios").find("login", "button 'Sign in'")
    todo.forget("do", "log in")
    todo.purge()

    client.add_example.assert_called_once_with(
        "log in", ["click button 'Login'"], app="todo.example.com", layer="product"
    )
    client.add_hint.assert_called_once_with("find", "login", "button 'Sign in'", app="todo.example.com", layer="ios")
    client.forget_lesson.assert_called_once_with("do", "log in", app="todo.example.com", layer="product")
    client.clear_layer.assert_called_once_with(app="todo.example.com", layer="product")
