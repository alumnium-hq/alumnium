import pytest
from unittest.mock import patch, MagicMock, create_autospec
from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.models import Model
from alumnium.alumni import Alumni


@pytest.mark.parametrize(
        ("model_class", "model", "expected_params"),
        [
            (
                "alumnium.alumni.AzureChatOpenAI",
                Model.AZURE_OPENAI,
                {"model":Model.AZURE_OPENAI.value, "api_version":"", "temperature":0, "seed":1}
            ),
            (
                "alumnium.alumni.ChatAnthropic",
                Model.ANTHROPIC,
                {"model":Model.ANTHROPIC.value, "temperature":0}
            ),
            (
                "alumnium.alumni.ChatBedrockConverse",
                Model.AWS_ANTHROPIC,
                {"model_id":Model.AWS_ANTHROPIC.value, "temperature":0, "aws_access_key_id":"", "aws_secret_access_key":"", "region_name":"us-east-1"}
            ),
            (
                "alumnium.alumni.ChatBedrockConverse",
                Model.AWS_META,
                {"model_id":Model.AWS_META.value, "temperature":0, "aws_access_key_id":"", "aws_secret_access_key":"", "region_name":"us-east-1"}
            ),
            (
                "alumnium.alumni.ChatDeepSeek",
                Model.DEEPSEEK,
                {"model":Model.DEEPSEEK.value, "temperature":0}
            ),
            (
                "alumnium.alumni.ChatGoogleGenerativeAI",
                Model.GOOGLE,
                {"model":Model.GOOGLE.value, "temperature":0}
            ),
            (
                "alumnium.alumni.ChatOpenAI",
                None,
                {"model":Model.OPENAI.value, "temperature":0, "seed":1}
            ),
        ]
)
@patch("alumnium.alumni.ActorAgent")
@patch("alumnium.alumni.PlannerAgent")
@patch("alumnium.alumni.RetrieverAgent")
def test_alumni_llm_initialization(mock_retriever, mock_planner, mock_actor, model_class, model, expected_params):
    with patch(model_class) as mock_llm_class:
        mock_llm_instance = MagicMock()
        mock_llm_class.return_value = mock_llm_instance

        mock_driver = create_autospec(WebDriver)
        mock_driver.command_executor = MagicMock()

        alumni = Alumni(mock_driver, model=model)

        mock_llm_class.assert_called_once_with(**expected_params)

        mock_actor.assert_called_once_with(alumni.driver, mock_llm_instance)
        mock_planner.assert_called_once_with(alumni.driver, mock_llm_instance)
        mock_retriever.assert_called_once_with(alumni.driver, mock_llm_instance)
