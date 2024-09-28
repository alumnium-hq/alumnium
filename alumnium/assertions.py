from pydantic import BaseModel, Field


class AssertionResult(BaseModel):
    """Result of an assertion of a statement on a webpage screenshot."""

    result: bool = Field(description="Result of the assertion.")
    reason: str = Field(description="Reason for the assertion result.")
