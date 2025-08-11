import base64
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from alumnium.accessibility.base_accessibility_tree import BaseAccessibilityTree
from alumnium.agents.retriever_agent import Data
from alumnium.logutils import get_logger
from alumnium.models import Model

from .models import (
    ActionRequest,
    ActionResponse,
    ActionsResponse,
    ErrorResponse,
    SessionResponse,
    VerificationRequest,
    VerificationResponse,
)
from .session_manager import ServerSessionManager

logger = get_logger(__name__)

# Global session manager
session_manager = ServerSessionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Alumnium Server")
    yield
    logger.info("Shutting down Alumnium Server")


# FastAPI app
app = FastAPI(
    title="Alumnium Server", description="AI-powered test automation server", version="0.1.0", lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "model": f"{Model.current.provider.value}/{Model.current.name}"}


@app.post("/sessions", response_model=SessionResponse)
async def create_session():
    """Create a new session."""
    try:
        session_id = session_manager.create_session()
        return SessionResponse(sessionId=session_id)
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create session: {str(e)}"
        )


@app.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str):
    """Delete a session."""
    if not session_manager.delete_session(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


@app.get("/sessions", response_model=List[str])
async def list_sessions():
    """List all active sessions."""
    return session_manager.list_sessions()


@app.get("/sessions/{session_id}/stats")
async def get_session_stats(session_id: str):
    """Get session statistics."""
    stats = session_manager.get_session_stats(session_id)
    if stats is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return stats


@app.post("/sessions/{session_id}/actions", response_model=ActionsResponse)
async def plan_actions(session_id: str, request: ActionRequest):
    """Plan actions to achieve a goal."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    try:
        # Get planner steps
        steps = session.planner_agent.invoke(request.goal, request.aria)

        # Convert steps to actions using actor agent
        actions = []
        for step in steps:
            actor_responses = session.actor_agent.invoke(request.goal, step, request.aria)

            # Convert tool calls to action responses
            for tool_call in actor_responses:
                action = ActionResponse(type=tool_call.name, args=tool_call.args)
                actions.append(action)

        return ActionsResponse(actions=actions)

    except Exception as e:
        logger.error(f"Failed to plan actions for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to plan actions: {str(e)}"
        )


@app.post("/sessions/{session_id}/verifications", response_model=VerificationResponse)
async def verify_statement(session_id: str, request: VerificationRequest):
    """Verify a statement against the current page state."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    try:
        # Decode screenshot if provided
        screenshot_bytes = None
        if request.screenshot:
            try:
                screenshot_bytes = base64.b64decode(request.screenshot)
            except Exception as e:
                logger.warning(f"Failed to decode screenshot: {e}")

        # Use retriever agent to verify the statement
        result = session.retriever_agent.invoke(
            f"Is the following true or false - {request.statement}",
            request.aria,
            title=request.title,
            url=request.url,
            screenshot=screenshot_bytes,
        )

        return VerificationResponse(result=bool(result.value), explanation=result.explanation)

    except Exception as e:
        logger.error(f"Failed to verify statement for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to verify statement: {str(e)}"
        )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    return ErrorResponse(error=exc.detail, detail=str(exc.status_code))


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}")
    return ErrorResponse(error="Internal server error", detail=str(exc))


def main():
    """Main entry point for running the server."""
    import uvicorn

    uvicorn.run("alumnium.server.main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")


if __name__ == "__main__":
    main()
