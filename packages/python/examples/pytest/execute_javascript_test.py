from pytest import mark

from alumnium import Alumni, Model, Provider
from alumnium.tools import ExecuteJavascriptTool


@mark.xfail(Model.current.provider == Provider.DEEPSEEK, reason="No vision support yet")
@mark.xfail(
    Model.current.provider == Provider.XAI,
    reason="""
Requires separate check agent as it prefers to follow
retriever instructions (return `value` instead of `statement`)
    """,
)
def test_execute_javascript_to_scroll(al, driver, navigate):
    al = Alumni(driver, extra_tools=[ExecuteJavascriptTool])
    navigate("https://the-internet.herokuapp.com/large")
    al.check("'Powered by Elemental Selenium' is not present", vision=True)
    al.do("execute javascript 'window.scrollTo(0, document.body.scrollHeight)'")
    al.check("'Powered by Elemental Selenium' is present", vision=True)
