# Alumnium Server

FastAPI server that centralizes AI-powered test automation logic, enabling multiple language clients to communicate with LLMs without reimplementing prompts, agents, or caching.

## Architecture

The server acts as a bridge between test automation clients (Ruby, JavaScript, Python, etc.) and AI language models. It provides REST endpoints for:

- **Session Management**: Create, delete, and manage independent LLM sessions with dynamic tool schemas
- **Action Planning**: Break down high-level goals into executable steps
- **Action Execution**: Convert steps into specific UI interactions
- **Statement Verification**: Check assertions against page state with screenshot support
- **Area Detection**: Identify specific regions of a page
- **Example Management**: Add and manage training examples for the planner agent

## Installation

From the root directory:

```bash
# Install server dependencies
make install-server
```

## Running the Server

```bash
make start-server
# Or directly with main.py
poetry run python -m alumnium.server.main
```

## API Endpoints

**Note**: All API endpoints are versioned with `/v1` prefix. All request and response models include an `api_version` field set to `"v1"`.

### Session Management

- `POST /v1/sessions` - Create a new session with specific provider and model
- `DELETE /v1/sessions/{session_id}` - Delete a session
- `GET /v1/sessions` - List all active sessions
- `GET /v1/sessions/{session_id}/stats` - Get session token usage statistics

### Planning & Execution

- `POST /v1/sessions/{session_id}/plans` - Plan high-level steps to achieve a goal
- `POST /v1/sessions/{session_id}/steps` - Generate specific actions for a step
- `POST /v1/sessions/{session_id}/statements` - Execute/verify statements against page state
- `POST /v1/sessions/{session_id}/areas` - Identify specific areas on a page

### Example Management

- `POST /v1/sessions/{session_id}/examples` - Add training examples to the planner
- `DELETE /v1/sessions/{session_id}/examples` - Clear all training examples

### Cache Management

- `POST /v1/sessions/{session_id}/caches` - Persist the in-memory cache
- `DELETE /v1/sessions/{session_id}/caches` - Discard the in-memory cache

### Health Check

- `GET /health` - Health check and current model information

## Example Usage

### Create Session with Standard Tools
```bash
curl -X POST http://localhost:8013/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "name": "claude-haiku-4-5-20251001",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "ClickTool",
          "description": "Click an element.",
          "parameters": {
            "type": "object",
            "properties": {
              "id": {"type": "integer", "description": "Element identifier (ID)"}
            },
            "required": ["id"]
          }
        }
      }
    ]
  }'
# Response: {"session_id": "uuid-here", "api_version": "v1"}
```

### Plan Actions
```bash
curl -X POST http://localhost:8013/v1/sessions/{session_id}/plans \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "log in to the application",
    "accessibility_tree": "<accessibility_tree>...</accessibility_tree>",
    "url": "https://example.com/login",
    "title": "Login Page"
  }'
# Response: {"steps": ["Fill username field", "Fill password field", "Click login button"], "api_version": "v1"}
```

### Execute Step Actions
```bash
curl -X POST http://localhost:8013/v1/sessions/{session_id}/steps \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "log in to the application",
    "step": "Fill username field",
    "accessibility_tree": "<accessibility_tree>...</accessibility_tree>"
  }'
# Response: {"actions": [{"tool": "type", "args": {"id": "username", "text": "user@example.com"}}], "api_version": "v1"}
```

### Verify Statement
```bash
curl -X POST http://localhost:8013/v1/sessions/{session_id}/statements \
  -H "Content-Type: application/json" \
  -d '{
    "statement": "user is logged in successfully",
    "accessibility_tree": "<accessibility_tree>...</accessibility_tree>",
    "url": "https://example.com/dashboard",
    "title": "Dashboard",
    "screenshot": "iVBORw0KGgoAAAANSUhEU..."
  }'
# Response: {"result": "true", "explanation": "Dashboard page is visible with user menu", "api_version": "v1"}
```

### Add Training Example
```bash
curl -X POST http://localhost:8013/v1/sessions/{session_id}/examples \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "complete user registration",
    "actions": ["Fill name field", "Fill email field", "Fill password field", "Click register button"]
  }'
# Response: {"success": true, "message": "Example added successfully", "api_version": "v1"}
```

## Configuration

The server uses the same configuration as the main Alumnium library:

- `ALUMNIUM_MODEL` - AI model provider (anthropic, openai, google, etc.)
- `ALUMNIUM_LOG_PATH` - Log file path
- `ALUMNIUM_LOG_LEVEL` - Logging level
- `ALUMNIUM_CACHE` - Set cache provider or disable it. Defaults to filesystem

## Development

### Running Tests
```bash
poetry run pytest
```

### Code Quality
```bash
poetry run ruff check .
poetry run ruff format .
```
