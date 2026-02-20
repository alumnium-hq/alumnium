from typing import Any, Literal

from pydantic import BaseModel, Field


# Base versioned model
class VersionedModel(BaseModel):
    api_version: str = Field(default="v1", description="API version")


class SessionRequest(VersionedModel):
    platform: Literal["chromium", "uiautomator2", "xcuitest"]
    provider: str
    name: str | None = None
    tools: list[dict[str, Any]]
    planner: bool = True


class SessionResponse(VersionedModel):
    session_id: str


class PlanRequest(VersionedModel):
    goal: str
    accessibility_tree: str
    url: str | None = None
    title: str | None = None


class PlanResponse(VersionedModel):
    explanation: str
    steps: list[str]


class StepRequest(VersionedModel):
    goal: str
    step: str
    accessibility_tree: str


class StepResponse(VersionedModel):
    explanation: str
    actions: list[dict[str, Any]]


class StatementRequest(VersionedModel):
    statement: str
    accessibility_tree: str
    url: str | None = None
    title: str | None = None
    screenshot: str | None = None  # base64 encoded image


class StatementResponse(VersionedModel):
    result: str | list[str]
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
    actions: list[str]


class AddExampleResponse(VersionedModel):
    success: bool
    message: str


class ClearExamplesResponse(VersionedModel):
    success: bool
    message: str


class CacheResponse(VersionedModel):
    success: bool
    message: str


class ChangeState(VersionedModel):
    accessibility_tree: str
    url: str


class ChangesRequest(VersionedModel):
    before: ChangeState
    after: ChangeState


class ChangesResponse(VersionedModel):
    result: str


class ErrorResponse(VersionedModel):
    error: str
    detail: str | None = None
