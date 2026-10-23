from unittest.mock import MagicMock, patch

from alumnium.alumni import Alumni
from alumnium.area import Area
from alumnium.clients.http_client import HttpClient


def http_client() -> HttpClient:
    client = HttpClient.__new__(HttpClient)
    client.base_url = "http://localhost:8013"
    client.session_id = "session"
    return client


def find_element_body(**kwargs) -> dict:
    with patch("alumnium.clients.http_client.post") as post:
        post.return_value.json.return_value = {"elements": [{"id": 1, "explanation": "button"}]}
        element = http_client().find_element("login button", "<tree/>", app="app", **kwargs)

    assert element == {"id": 1, "explanation": "button"}
    assert post.call_args.args[0] == "http://localhost:8013/v1/sessions/session/elements"
    return post.call_args.kwargs["json"]


def test_find_element_omits_cache_by_default():
    assert find_element_body() == {"description": "login button", "accessibility_tree": "<tree/>", "app": "app"}


def test_find_element_sends_cache_false():
    assert find_element_body(cache=False) == {
        "description": "login button",
        "accessibility_tree": "<tree/>",
        "app": "app",
        "cache": False,
    }


def test_alumni_find_passes_cache_to_client():
    alumni = MagicMock()
    alumni.client.find_element.return_value = {"id": 1}

    Alumni.find(alumni, "login button", cache=False)

    assert alumni.client.find_element.call_args.kwargs["cache"] is False


def test_area_find_passes_cache_to_client():
    area = MagicMock()
    area.client.find_element.return_value = {"id": 1}

    Area.find(area, "login button", cache=False)

    assert area.client.find_element.call_args.kwargs["cache"] is False
