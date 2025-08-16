from typing import Any, List, Optional

from pydantic import BaseModel


class SessionRequest(BaseModel):
    provider: str
    name: Optional[str] = None
    tools: dict[str, Any]


class SessionResponse(BaseModel):
    sessionId: str


class PlanRequest(BaseModel):
    goal: str
    accessibility_tree: str
    url: Optional[str] = None
    title: Optional[str] = None


class PlanResponse(BaseModel):
    steps: List[str]


class StepRequest(BaseModel):
    goal: str
    step: str
    accessibility_tree: str


class StepResponse(BaseModel):
    actions: List[dict[str, Any]]


class VerificationRequest(BaseModel):
    statement: str
    accessibility_tree: str
    url: Optional[str] = None
    title: Optional[str] = None
    screenshot: Optional[str] = None  # base64 encoded image


class VerificationResponse(BaseModel):
    result: bool
    explanation: str


class AreaRequest(BaseModel):
    description: str
    accessibility_tree: str


class AreaResponse(BaseModel):
    area: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
