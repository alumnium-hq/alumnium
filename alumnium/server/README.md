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
make server-serve-dev

# Production mode
make server-serve

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
curl -X POST http://localhost:8013/sessions/c2660316-830f-43fc-9546-76cb15f3a8cc/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "2 + 2 =",
    "accessibility_tree": "<RootWebArea name=\"\" id=\"1\" focusable=\"True\" focused=\"True\" url=\"https://seleniumbase.io/apps/calculator\"> <generic id=\"4\"> <generic id=\"5\"> <generic id=\"6\"> <LabelText id=\"29\" /> <link id=\"34\" focusable=\"True\" url=\"https://seleniumbase.io/apps/calculator\">Calculator</link> <link id=\"42\" focusable=\"True\" url=\"https://seleniumbase.io/\">SB</link> </generic> <generic id=\"8\"> <textbox id=\"43\" invalid=\"false\" focusable=\"True\" editable=\"plaintext\" multiline=\"False\" readonly=\"True\" required=\"False\"> <generic id=\"67\">0</generic> </textbox> </generic> <button id=\"9\" invalid=\"false\" focusable=\"True\">C</button> <button id=\"10\" invalid=\"false\" focusable=\"True\">(</button> <button id=\"11\" invalid=\"false\" focusable=\"True\">)</button> <button id=\"12\" invalid=\"false\" focusable=\"True\">÷</button> <button id=\"13\" invalid=\"false\" focusable=\"True\">7</button> <button id=\"14\" invalid=\"false\" focusable=\"True\">8</button> <button id=\"15\" invalid=\"false\" focusable=\"True\">9</button> <button id=\"16\" invalid=\"false\" focusable=\"True\">×</button> <button id=\"17\" invalid=\"false\" focusable=\"True\">4</button> <button id=\"18\" invalid=\"false\" focusable=\"True\">5</button> <button id=\"19\" invalid=\"false\" focusable=\"True\">6</button> <button id=\"20\" invalid=\"false\" focusable=\"True\">-</button> <button id=\"21\" invalid=\"false\" focusable=\"True\">1</button> <button id=\"22\" invalid=\"false\" focusable=\"True\">2</button> <button id=\"23\" invalid=\"false\" focusable=\"True\">3</button> <button id=\"24\" invalid=\"false\" focusable=\"True\">+</button> <button id=\"25\" invalid=\"false\" focusable=\"True\">←</button> <button id=\"26\" invalid=\"false\" focusable=\"True\">0</button> <button id=\"27\" invalid=\"false\" focusable=\"True\">.</button> <button id=\"28\" invalid=\"false\" focusable=\"True\">=</button> </generic> </generic> </RootWebArea>",
    "url": "https://seleniumbase.io/apps/calculator",
    "title": "Calculator"
  }'
# Response: {"steps": ["Fill username field", "Fill password field", "Click login button"]}
```

### Execute Step Actions
```bash
curl -X POST http://localhost:8013/sessions/{sessionId}/step \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "2 + 2 =",
    "step": "click button \"2\"",
    "accessibility_tree": "<RootWebArea name=\"\" id=\"1\" focusable=\"True\" focused=\"True\" url=\"https://seleniumbase.io/apps/calculator\"> <generic id=\"4\"> <generic id=\"5\"> <generic id=\"6\"> <LabelText id=\"29\" /> <link id=\"34\" focusable=\"True\" url=\"https://seleniumbase.io/apps/calculator\">Calculator</link> <link id=\"42\" focusable=\"True\" url=\"https://seleniumbase.io/\">SB</link> </generic> <generic id=\"8\"> <textbox id=\"43\" invalid=\"false\" focusable=\"True\" editable=\"plaintext\" multiline=\"False\" readonly=\"True\" required=\"False\"> <generic id=\"67\">0</generic> </textbox> </generic> <button id=\"9\" invalid=\"false\" focusable=\"True\">C</button> <button id=\"10\" invalid=\"false\" focusable=\"True\">(</button> <button id=\"11\" invalid=\"false\" focusable=\"True\">)</button> <button id=\"12\" invalid=\"false\" focusable=\"True\">÷</button> <button id=\"13\" invalid=\"false\" focusable=\"True\">7</button> <button id=\"14\" invalid=\"false\" focusable=\"True\">8</button> <button id=\"15\" invalid=\"false\" focusable=\"True\">9</button> <button id=\"16\" invalid=\"false\" focusable=\"True\">×</button> <button id=\"17\" invalid=\"false\" focusable=\"True\">4</button> <button id=\"18\" invalid=\"false\" focusable=\"True\">5</button> <button id=\"19\" invalid=\"false\" focusable=\"True\">6</button> <button id=\"20\" invalid=\"false\" focusable=\"True\">-</button> <button id=\"21\" invalid=\"false\" focusable=\"True\">1</button> <button id=\"22\" invalid=\"false\" focusable=\"True\">2</button> <button id=\"23\" invalid=\"false\" focusable=\"True\">3</button> <button id=\"24\" invalid=\"false\" focusable=\"True\">+</button> <button id=\"25\" invalid=\"false\" focusable=\"True\">←</button> <button id=\"26\" invalid=\"false\" focusable=\"True\">0</button> <button id=\"27\" invalid=\"false\" focusable=\"True\">.</button> <button id=\"28\" invalid=\"false\" focusable=\"True\">=</button> </generic> </generic> </RootWebArea>",
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
