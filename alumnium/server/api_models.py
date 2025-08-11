from typing import Any, List, Optional

from pydantic import BaseModel


class SessionRequest(BaseModel):
    provider: str
    name: str
    tools: Optional[dict[str, Any]] = None  # Tools can be optional, default to None


class SessionResponse(BaseModel):
    sessionId: str


class ActionRequest(BaseModel):
    goal: str
    aria: str
    url: Optional[str] = None
    title: Optional[str] = None


class ActionResponse(BaseModel):
    type: str
    args: dict[str, Any]


class ActionsResponse(BaseModel):
    actions: List[ActionResponse]


class VerificationRequest(BaseModel):
    statement: str
    aria: str
    url: Optional[str] = None
    title: Optional[str] = None
    screenshot: Optional[str] = None  # base64 encoded image


class VerificationResponse(BaseModel):
    result: bool
    explanation: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
