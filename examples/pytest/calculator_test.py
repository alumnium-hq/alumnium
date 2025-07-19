from os import getenv

from pytest import fixture, mark

from alumnium import Model, Provider

alumnium_driver = getenv("ALUMNIUM_DRIVER", "selenium")


@fixture(autouse=True)
def learn(al):
    # Llama constantly messes the order of operations.
    # Haiku cannot correlate '/' button to '÷'.
    # Mistral skips '+' button.
    al.learn(
        goal="4 / 2 =",
        actions=[
            "click button '4'",
            "click button '÷'",
            "click button '2'",
            "click button '='",
        ],
    )
    yield
    al.planner_agent.prompt_with_examples.examples.clear()


def test_addition(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("2 + 2 =")
    assert al.get("value from textfield") == 4


def test_subtraction(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("5 - 3 =")
    assert al.get("value from textfield") == 2


@mark.xfail(
    Model.current.provider in [Provider.ANTHROPIC, Provider.AWS_ANTHROPIC] and alumnium_driver == "appium",
    reason="Incorrect element is identified ",
)
def test_multiplication(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("3 * 4 =")
    assert al.get("value from textfield") == 12


def test_division(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("8 / 2 =")
    assert al.get("value from textfield") == 4
