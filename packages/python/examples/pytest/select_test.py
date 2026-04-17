from os import getenv

import pytest
from pytest import mark, raises

from alumnium import Provider


@mark.xfail(
    getenv("ALUMNIUM_DRIVER", "selenium") == "appium-ios",
    reason="Appium doesn't support select tool yet",
)
def test_select_option(al, navigate):
    model_provider = al.get_model().provider
    if model_provider == Provider.OLLAMA:
        pytest.xfail("Poor instruction following")
    if model_provider in (Provider.DEEPSEEK, Provider.XAI):
        pytest.xfail(
            "Requires separate check agent as it prefers to follow "
            "retriever instructions (return `value` instead of `statement`)"
        )

    navigate("https://the-internet.herokuapp.com/dropdown")

    al.check("Option 1 is not selected")
    with raises(AssertionError):
        al.check("Option 1 is selected")

    al.check("Option 2 is not selected")
    with raises(AssertionError):
        al.check("Option 2 is selected")

    al.do("select 'Option 1'")

    al.check("Option 1 is selected")
    with raises(AssertionError):
        al.check("Option 1 is not selected")

    al.check("Option 2 is not selected")
    with raises(AssertionError):
        al.check("Option 2 is selected")
