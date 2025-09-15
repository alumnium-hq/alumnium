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
# Development mode with auto-reload
make start-server-dev

# Production mode
make start-server

# Or directly with main.py
poetry run python -m alumnium.server.main
```

## API Endpoints

### Session Management

- `POST /sessions` - Create a new session with specific provider and model
- `DELETE /sessions/{sessionId}` - Delete a session
- `GET /sessions` - List all active sessions
- `GET /sessions/{sessionId}/stats` - Get session token usage statistics

### Planning & Execution

- `POST /sessions/{sessionId}/plan` - Plan high-level steps to achieve a goal
- `POST /sessions/{sessionId}/step` - Generate specific actions for a step
- `POST /sessions/{sessionId}/statement` - Execute/verify statements against page state
- `POST /sessions/{sessionId}/area` - Identify specific areas on a page

### Example Management

- `POST /sessions/{sessionId}/examples` - Add training examples to the planner
- `DELETE /sessions/{sessionId}/examples` - Clear all training examples

### Health Check

- `GET /health` - Health check and current model information

## Example Usage

### Create Session with Standard Tools
```bash
curl -X POST http://localhost:8013/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "name": "claude-3-haiku-20240307",
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
# Response: {"sessionId": "uuid-here"}
```

### Plan Actions
```bash
curl -X POST http://localhost:8013/sessions/{sessionId}/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "log in to the application",
    "accessibility_tree": "<accessibility_tree>...</accessibility_tree>",
    "url": "https://example.com/login",
    "title": "Login Page"
  }'
# Response: {"steps": ["Fill username field", "Fill password field", "Click login button"]}
```

### Execute Step Actions
```bash
curl -X POST http://localhost:8013/sessions/{sessionId}/step \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "log in to the application",
    "step": "Fill username field",
    "accessibility_tree": "<accessibility_tree>...</accessibility_tree>"
  }'
# Response: {"actions": [{"tool": "type", "args": {"id": "username", "text": "user@example.com"}}]}
```

### Verify Statement
```bash
curl -X POST http://localhost:8013/sessions/{sessionId}/statement \
  -H "Content-Type: application/json" \
  -d '{
    "statement": "user is logged in successfully",
    "accessibility_tree": "<accessibility_tree>...</accessibility_tree>",
    "url": "https://example.com/dashboard",
    "title": "Dashboard",
    "screenshot": "iVBORw0KGgoAAAANSUhEU..."
  }'
# Response: {"result": "true", "explanation": "Dashboard page is visible with user menu"}
```

### Add Training Example
```bash
curl -X POST http://localhost:8013/sessions/{sessionId}/examples \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "complete user registration",
    "actions": ["Fill name field", "Fill email field", "Fill password field", "Click register button"]
  }'
# Response: {"success": true, "message": "Example added successfully"}
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
