# Alumnium Server

FastAPI server that centralizes AI-powered test automation logic, enabling multiple language clients to communicate with LLMs without reimplementing prompts, agents, or caching.

## Architecture

The server acts as a bridge between test automation clients (Ruby, JavaScript, Python, etc.) and AI language models. It provides REST endpoints for:

- Session management
- Action planning (breaking down goals into executable steps)
- Statement verification (checking assertions against page state)

## Installation

From the server directory:

```bash
poetry install
```

## Running the Server

```bash
# Using poetry
poetry run alumnium-server

# Or directly with uvicorn
poetry run uvicorn alumnium.server.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### Session Management

- `POST /sessions` - Create a new session
- `DELETE /sessions/{sessionId}` - Delete a session  
- `GET /sessions` - List all active sessions
- `GET /sessions/{sessionId}/stats` - Get session token usage stats

### Test Automation

- `POST /sessions/{sessionId}/actions` - Plan actions to achieve a goal
- `POST /sessions/{sessionId}/verifications` - Verify statements against page state

### Health Check

- `GET /health` - Health check and current model info

## Example Usage

### Create Session
```bash
curl -X POST http://localhost:8000/sessions
# Response: {"sessionId": "uuid-here"}
```

### Plan Actions
```bash
curl -X POST http://localhost:8000/sessions/{sessionId}/actions \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "click the login button",
    "aria": "<accessibility tree XML>",
    "url": "https://example.com",
    "title": "Example Page"
  }'
# Response: {"actions": [{"type": "click", "args": {"id": "login-btn"}}]}
```

### Verify Statement
```bash
curl -X POST http://localhost:8000/sessions/{sessionId}/verifications \
  -H "Content-Type: application/json" \
  -d '{
    "statement": "user is logged in",
    "aria": "<accessibility tree XML>",
    "screenshot": "<base64-encoded-image>"
  }'
# Response: {"result": true, "explanation": "Login successful indicator visible"}
```

## Configuration

The server uses the same configuration as the main Alumnium library:

- `ALUMNIUM_MODEL` - AI model provider (anthropic, openai, google, etc.)
- `ALUMNIUM_LOG_PATH` - Log file path
- `ALUMNIUM_LOG_LEVEL` - Logging level

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