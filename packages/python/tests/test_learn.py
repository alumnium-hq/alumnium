from unittest.mock import MagicMock

import pytest

from alumnium.alumni import Alumni
from alumnium.knowledge import Knowledge
from alumnium.learn import Learn


def alumni() -> tuple[Alumni, MagicMock]:
    al = Alumni.__new__(Alumni)
    client = MagicMock()
    al.client = client
    al.driver = MagicMock()
    al.driver.app = "example-com"
    return al, client


def test_learn_is_deprecated():
    with pytest.warns(DeprecationWarning, match="use `Alumni.knowledge` instead"):
        learn = alumni()[0].learn

    assert isinstance(learn, Learn)
    assert isinstance(learn, Knowledge)


def test_learn_teaches_do_when_called_directly():
    al, client = alumni()
    with pytest.warns(DeprecationWarning):
        al.learn("log in", ["click button 'Login'"])

    client.add_example.assert_called_once_with("log in", ["click button 'Login'"], app="example-com", layer="product")


def test_learn_teaches_like_knowledge():
    al, client = alumni()
    with pytest.warns(DeprecationWarning):
        al.learn.on("android").find("login", "button 'Sign in'")

    client.add_hint.assert_called_once_with("find", "login", "button 'Sign in'", app="example-com", layer="android")
