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


class SessionResponse(VersionedModel):
    session_id: str


class PlanRequest(VersionedModel):
    goal: str
    raw_data: dict | str  # CDP dict for Chromium, XML string for XCUITest/UIAutomator2
    automation_type: str  # "chromium", "xcuitest", or "uiautomator2"
    url: Optional[str] = None
    title: Optional[str] = None


class PlanResponse(VersionedModel):
    steps: List[str]
    id_mappings: Optional[dict[str, int]] = None  # JSON keys must be strings


class StepRequest(VersionedModel):
    goal: str
    step: str
    raw_data: dict | str
    automation_type: str


class StepResponse(VersionedModel):
    actions: List[dict[str, Any]]
    id_mappings: Optional[dict[str, int]] = None  # JSON keys must be strings


class StatementRequest(VersionedModel):
    statement: str
    raw_data: dict | str
    automation_type: str
    url: Optional[str] = None
    title: Optional[str] = None
    screenshot: Optional[str] = None  # base64 encoded image


class StatementResponse(VersionedModel):
    # TODO: Move typecasting to the client
    result: Data
    explanation: str
    id_mappings: Optional[dict[str, int]] = None  # JSON keys must be strings


class AreaRequest(VersionedModel):
    description: str
    raw_data: dict | str
    automation_type: str


class AreaResponse(VersionedModel):
    id: int
    explanation: str
    id_mappings: Optional[dict[str, int]] = None  # JSON keys must be strings


class FindRequest(VersionedModel):
    description: str
    raw_data: dict | str
    automation_type: str


class FindResponse(VersionedModel):
    elements: list[dict[str, int | str]]
    id_mappings: Optional[dict[str, int]] = None  # JSON keys must be strings


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
