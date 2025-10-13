from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

from .agents.retriever_agent import Data


# Base versioned model
class VersionedModel(BaseModel):
    api_version: str = Field(default="v1", description="API version")


class SessionRequest(VersionedModel):
    platform: Literal["chromium", "uiautomator2", "xcuitest"]
    provider: str
    name: Optional[str] = None
    tools: List[dict[str, Any]]


class SessionResponse(VersionedModel):
    session_id: str


class PlanRequest(VersionedModel):
    goal: str
    accessibility_tree: str
    url: Optional[str] = None
    title: Optional[str] = None


class PlanResponse(VersionedModel):
    steps: List[str]


class StepRequest(VersionedModel):
    goal: str
    step: str
    accessibility_tree: str


class StepResponse(VersionedModel):
    actions: List[dict[str, Any]]


class StatementRequest(VersionedModel):
    statement: str
    accessibility_tree: str
    url: Optional[str] = None
    title: Optional[str] = None
    screenshot: Optional[str] = None  # base64 encoded image


class StatementResponse(VersionedModel):
    # TODO: Move typecasting to the client
    result: Data
    explanation: str


class AreaRequest(VersionedModel):
    description: str
    accessibility_tree: str


class AreaResponse(VersionedModel):
    id: int
    explanation: str


class FindRequest(VersionedModel):
    description: str
    accessibility_tree: str


class FindResponse(VersionedModel):
    elements: list[dict[str, int | str]]


class AddExampleRequest(VersionedModel):
    goal: str
    actions: List[str]


class AddExampleResponse(VersionedModel):
    success: bool
    message: str


class ClearExamplesResponse(VersionedModel):
    success: bool
    message: str


class CacheResponse(VersionedModel):
    success: bool
    message: str


class ErrorResponse(VersionedModel):
    error: str
    detail: Optional[str] = None
