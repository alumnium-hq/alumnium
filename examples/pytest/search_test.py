from pytest import fixture, raises

from alumnium import Model


@fixture(autouse=True)
def learn(al):
    # Gemini/Haiku have issues learning how to search
    if Model.load() in [Model.AWS_META, Model.GOOGLE]:
        al.learn(
            goal="search for artificial intelligence",
            actions=[
                "type 'artificial intelligence' into a search field",
                "press key 'Enter'",
            ],
        )
    yield
    if Model.load() in [Model.AWS_META, Model.GOOGLE]:
        al.planner_agent.prompt_with_examples.examples.clear()


def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCHA

    al.do("search for selenium")
    al.check("page title contains selenium")
    assert al.get("atomic number") == 34

    al.check("search results contain selenium.dev")
    with raises(AssertionError):
        al.check("search results does not contain selenium.dev")
