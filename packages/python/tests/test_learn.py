from unittest.mock import MagicMock

import pytest

from alumnium.alumni import Alumni
from alumnium.knowledge import Knowledge
from alumnium.learn import Learn


def alumni() -> Alumni:
    al = Alumni.__new__(Alumni)
    al.client = MagicMock()
    al.driver = MagicMock()
    al.driver.app = "example-com"
    return al


def test_learn_is_deprecated():
    with pytest.warns(DeprecationWarning, match="use `Alumni.knowledge` instead"):
        learn = alumni().learn

    assert isinstance(learn, Learn)
    assert isinstance(learn, Knowledge)


def test_learn_teaches_do_when_called_directly():
    al = alumni()
    with pytest.warns(DeprecationWarning):
        al.learn("log in", ["click button 'Login'"])

    al.client.add_example.assert_called_once_with(
        "log in", ["click button 'Login'"], app="example-com", layer="product"
    )


def test_learn_teaches_like_knowledge():
    al = alumni()
    with pytest.warns(DeprecationWarning):
        al.learn.on("android").find("login", "button 'Sign in'")

    al.client.add_hint.assert_called_once_with("find", "login", "button 'Sign in'", app="example-com", layer="android")
