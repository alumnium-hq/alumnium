from pytest import fixture, raises

from alumnium import Model


@fixture(autouse=True)
def learn(al):
    # Claude/Gemini/Llama have issues learning how to search
    if Model.load() in [Model.ANTHROPIC, Model.AWS_ANTHROPIC, Model.AWS_META, Model.GOOGLE]:
        al.learn(
            goal="search for artificial intelligence",
            actions=[
                "type 'artificial intelligence' into a search field",
                "press key 'Enter'",
            ],
        )
    yield
    al.planner_agent.remove_example("search for artificial intelligence")


def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCHA

    al.do("search for selenium")
    al.check("page title contains selenium")
    assert al.get("atomic number") == 34

    al.check("search results contain selenium.dev")
    with raises(AssertionError):
        al.check("search results does not contain selenium.dev")
