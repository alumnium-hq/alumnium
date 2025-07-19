# Alumnium Server

The Alumnium Server provides centralized LLM communication for the Alumnium framework. It allows client applications in different languages (Python, Ruby, JavaScript, etc.) to leverage the same LLM-powered automation capabilities without re-implementing prompts, caching, and other infrastructure.


## Quick Start

## API Endpoints

### Session Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions` | Create a new session |
| DELETE | `/sessions/{sessionId}` | Delete a session |
| GET | `/sessions` | List all active sessions |
| GET | `/sessions/{sessionId}/stats` | Get session statistics |

### Actions and Verifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions/{sessionId}/actions` | Plan actions to achieve a goal |
| POST | `/sessions/{sessionId}/step` | Execute a single step |
| POST | `/sessions/{sessionId}/verifications` | Verify a statement about the page |
| POST | `/sessions/{sessionId}/data` | Extract data from the page |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Get total statistics for all sessions |
| GET | `/health` | Health check endpoint |

## Environment Variables

- `PORT`: Server port (default: 8081)
- `HOST`: Server host (default: 0.0.0.0)

## API Examples

### Creating a Session

```bash
curl -X POST http://localhost:8081/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "model": {
      "provider": "openai",
      "name": "gpt-4o-mini"
    }
  }'
```

Response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Planning Actions

```bash
curl -X POST http://localhost:8081/sessions/550e8400-e29b-41d4-a716-446655440000/actions \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Log in to the application",
    "aria": "<root><button id=\"1\" name=\"Login\">Login</button></root>",
    "url": "https://example.com/login",
    "title": "Login Page"
  }'
```

Response:
```json
{
  "actions": [
    {
      "type": "click",
      "args": {"id": 1}
    }
  ]
}
```

### Executing a Single Step

```bash
curl -X POST http://localhost:8081/sessions/550e8400-e29b-41d4-a716-446655440000/step \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Log in to the application",
    "step": "Click the login button",
    "aria": "<root><button id=\"1\" name=\"Login\">Login</button></root>"
  }'
```

Response:
```json
{
  "tool_calls": [
    {
      "name": "ClickTool",
      "args": {"id": "1"}
    }
  ]
}
```

### Verifying a Statement

```bash
curl -X POST http://localhost:8081/sessions/550e8400-e29b-41d4-a716-446655440000/verifications \
  -H "Content-Type: application/json" \
  -d '{
    "statement": "The login button is visible",
    "aria": "<root><button id=\"1\" name=\"Login\">Login</button></root>",
    "url": "https://example.com/login"
  }'
```

Response:
```json
{
  "result": true,
  "explanation": "The login button with id 1 is present in the accessibility tree"
}
```

## Error Handling

The server returns appropriate HTTP status codes and error messages:

- `400 Bad Request`: Invalid request data
- `404 Not Found`: Session not found
- `500 Internal Server Error`: Server error

Error responses include:
```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

## Monitoring and Statistics

The server provides token usage statistics for monitoring LLM costs:

```bash
# Get session statistics
curl http://localhost:8081/sessions/550e8400-e29b-41d4-a716-446655440000/stats

# Get total statistics
curl http://localhost:8081/stats
```

Response:
```json
{
  "input_tokens": 1500,
  "output_tokens": 500,
  "total_tokens": 2000
}
```
