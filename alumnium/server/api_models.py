from typing import Any, List, Optional

from pydantic import BaseModel, Field

from .agents.retriever_agent import Data


# Base versioned model
class VersionedModel(BaseModel):
    api_version: str = Field(default="v1", description="API version")


class SessionRequest(VersionedModel):
    provider: str
    name: Optional[str] = None
    tools: List[dict[str, Any]]
    platform: str  # chromium, xcuitest, or uiautomator2


class SessionResponse(VersionedModel):
    session_id: str


class PlanRequest(VersionedModel):
    goal: str
    accessibility_tree: str
    url: Optional[str] = None
    title: Optional[str] = None
    area_id: Optional[int] = None


class PlanResponse(VersionedModel):
    steps: List[str]


class StepRequest(VersionedModel):
    goal: str
    step: str
    accessibility_tree: str
    area_id: Optional[int] = None


class StepResponse(VersionedModel):
    actions: List[dict[str, Any]]


class StatementRequest(VersionedModel):
    statement: str
    accessibility_tree: str
    url: Optional[str] = None
    title: Optional[str] = None
    screenshot: Optional[str] = None  # base64 encoded image
    area_id: Optional[int] = None


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
    area_id: Optional[int] = None


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
