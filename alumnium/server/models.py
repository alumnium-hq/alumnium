from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class Provider(str, Enum):
    AZURE_OPENAI = "azure_openai"
    ANTHROPIC = "anthropic"
    AWS_ANTHROPIC = "aws_anthropic"
    AWS_META = "aws_meta"
    DEEPSEEK = "deepseek"
    GOOGLE = "google"
    OLLAMA = "ollama"
    OPENAI = "openai"
    MISTRALAI = "mistralai"


DEFAULT_MODEL_NAMES = {
    Provider.AZURE_OPENAI: "gpt-4o-mini",  # 2024-07-18
    Provider.ANTHROPIC: "claude-3-haiku-20240307",
    Provider.AWS_ANTHROPIC: "anthropic.claude-3-haiku-20240307-v1:0",
    Provider.AWS_META: "us.meta.llama3-2-90b-instruct-v1:0",
    Provider.DEEPSEEK: "deepseek-chat",
    Provider.GOOGLE: "gemini-2.0-flash-001",
    Provider.OLLAMA: "mistral-small3.1",
    Provider.OPENAI: "gpt-4o-mini-2024-07-18",
    Provider.MISTRALAI: "mistral-medium-2505",
}


class Model(BaseModel):
    provider: Provider = Field(..., description="The model provider (e.g., 'openai', 'anthropic')")
    name: Optional[str] = Field(None, description="The model name")

    def get_name(self):
        return self.name or DEFAULT_MODEL_NAMES[self.provider]


class SessionModel:
    current = None

    def __init__(self, provider=None, name=None):
        self.provider = Provider(provider or Provider.OPENAI)
        self.name = name or DEFAULT_MODEL_NAMES.get(self.provider)
        self.set_current(self)

    @classmethod
    def set_current(cls, model):
        """Set the current model instance."""
        cls.current = model

    @classmethod
    def get_current(cls):
        """Get the current model instance."""
        return cls.current


class SessionCreateRequest(BaseModel):
    """Request to create a new session."""

    provider: str = Field(description="The model provider name")
    name: Optional[str] = Field(None, description="The model name")
    azure_openai_api_version: Optional[str] = Field(default=None, description="Azure OpenAI API version")
    aws_access_key: Optional[str] = Field(default=None, description="AWS access key")
    aws_secret_key: Optional[str] = Field(default=None, description="AWS secret key")
    aws_region_name: Optional[str] = Field(default="us-east-1", description="AWS region name")


class SessionCreateResponse(BaseModel):
    """Response with session ID."""

    session_id: str = Field(description="Unique session identifier")


class ActionRequest(BaseModel):
    """Request to plan actions."""

    goal: str = Field(description="The goal to be achieved")
    aria: str = Field(description="Accessibility tree in XML format")
    url: Optional[str] = Field(default=None, description="Current page URL")
    title: Optional[str] = Field(default=None, description="Current page title")


class Action(BaseModel):
    """A single action to be executed."""

    type: str = Field(description="Type of action (click, type, select, etc.)")
    args: Dict[str, Any] = Field(description="Action arguments")


class ActionResponse(BaseModel):
    """Response with planned actions."""

    actions: List[Action] = Field(description="List of actions to execute")


class StepRequest(BaseModel):
    """Request to execute a single step."""

    goal: str = Field(description="The overall goal being pursued")
    step: str = Field(description="The specific step to execute")
    aria: str = Field(description="Accessibility tree in XML format")


class ToolCall(BaseModel):
    """A tool call to be executed."""

    name: str = Field(description="Name of the tool to call")
    args: Dict[str, Any] = Field(description="Arguments for the tool call")


class StepResponse(BaseModel):
    """Response with tool calls for the step."""

    tool_calls: List[ToolCall] = Field(description="List of tool calls to execute")


class VerificationRequest(BaseModel):
    """Request to verify a statement."""

    statement: str = Field(description="The statement to verify")
    aria: str = Field(description="Accessibility tree in XML format")
    screenshot: Optional[str] = Field(default=None, description="Base64 encoded screenshot")
    url: Optional[str] = Field(default=None, description="Current page URL")
    title: Optional[str] = Field(default=None, description="Current page title")


class VerificationResponse(BaseModel):
    """Response with verification result."""

    result: bool = Field(description="Whether the statement is true")
    explanation: str = Field(description="Explanation of the verification result")


class DataRequest(BaseModel):
    """Request to extract data from the page."""

    data: str = Field(description="The data to extract")
    aria: str = Field(description="Accessibility tree in XML format")
    screenshot: Optional[str] = Field(default=None, description="Base64 encoded screenshot")
    url: Optional[str] = Field(default=None, description="Current page URL")
    title: Optional[str] = Field(default=None, description="Current page title")


class DataResponse(BaseModel):
    """Response with extracted data."""

    value: Optional[Union[str, int, float, bool, List[Union[str, int, float, bool]]]] = Field(
        description="The extracted data value"
    )
    explanation: str = Field(description="Explanation of how the data was extracted")


class ErrorResponse(BaseModel):
    """Error response."""

    error: str = Field(description="Error message")
    details: Optional[str] = Field(default=None, description="Additional error details")
