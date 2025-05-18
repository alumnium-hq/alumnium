from os import getenv

from pytest import fixture, mark, raises

from alumnium import Model, Provider


@fixture(autouse=True)
def learn(al):
    # Claude/Gemini/Mistral/Llama have issues learning how to search
    if Model.current.provider in [Provider.ANTHROPIC, Provider.AWS_ANTHROPIC, Provider.AWS_META, Provider.GOOGLE]:
        al.learn(
            goal="search for artificial intelligence",
            actions=[
                "type 'artificial intelligence' into a search field",
                "press key 'Enter'",
            ],
        )
    yield
    al.planner_agent.prompt_with_examples.examples.clear()


@mark.skipif(
    getenv("ALUMNIUM_DRIVER", "selenium") == "playwright" and getenv("ALUMNIUM_PLAYWRIGHT_HEADLESS", "true") == "true",
    reason="DuckDuckGo blocks headless browsers",
)
@mark.xfail(Model.current.provider == Provider.OLLAMA, reason="Poor instruction following")
def test_search(al, navigate):
    navigate("https://www.duckduckgo.com")  # Google forces reCAPTCH, so we use DuckDuckGoA

    al.do("search for selenium")
    al.check("page title contains selenium")
    assert al.get("atomic number") == 34

    al.check("search results contain selenium.dev")
    with raises(AssertionError):
        al.check("search results does not contain selenium.dev")
