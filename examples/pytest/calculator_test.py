from pytest import fixture


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
    assert al.get("calculator value") == 4


def test_subtraction(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("5 - 3 =")
    assert al.get("calculator value") == 2


def test_multiplication(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("3 * 4 =")
    assert al.get("calculator value") == 12


def test_division(al, navigate):
    navigate("https://seleniumbase.io/apps/calculator")
    al.do("8 / 2 =")
    assert al.get("calculator value") == 4
