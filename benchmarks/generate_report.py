#!/usr/bin/env python3
"""Generate an HTML report from Claude Code benchmark results."""

import json
import sys
from pathlib import Path
from datetime import datetime


def extract_tool_responses(transcript_path: Path) -> dict[str, str]:
    """Extract tool_use_id -> response text mapping from a transcript."""
    responses = {}
    pending_tool_ids = {}  # tool_use_id -> tool_name(input) string

    with open(transcript_path) as f:
        for line in f:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if entry.get("type") == "assistant":
                for block in entry.get("message", {}).get("content", []):
                    if block.get("type") == "tool_use" and block.get("id"):
                        tool_name = block.get("name", "unknown")
                        tool_input = json.dumps(block.get("input", {}))
                        key = f"Tool: {tool_name}({tool_input})"
                        pending_tool_ids[block["id"]] = key

            elif entry.get("type") == "user":
                msg_content = entry.get("message", {}).get("content", [])
                if isinstance(msg_content, list):
                    for block in msg_content:
                        if (
                            isinstance(block, dict)
                            and block.get("type") == "tool_result"
                        ):
                            tid = block.get("tool_use_id")
                            if tid and tid in pending_tool_ids:
                                result_text = ""
                                for rc in block.get("content", []):
                                    if (
                                        isinstance(rc, dict)
                                        and rc.get("type") == "text"
                                    ):
                                        result_text += rc.get("text", "")
                                if result_text:
                                    responses[pending_tool_ids[tid]] = result_text
                                del pending_tool_ids[tid]

    return responses


def enrich_messages_with_tool_responses(
    messages: list, tool_responses: dict[str, str]
) -> None:
    """Attach tool_response to messages that match tool call patterns."""
    for msg in messages:
        if (
            msg.get("role") == "assistant"
            and msg.get("content", "").startswith("Tool:")
            and "tool_response" not in msg
        ):
            content = msg["content"]
            if content in tool_responses:
                msg["tool_response"] = tool_responses[content]


def load_task_data(task_dir: Path) -> dict | None:
    """Load all data for a single task."""
    metadata_path = task_dir / "metadata.json"
    messages_path = task_dir / "interact_messages.json"
    transcript_path = task_dir / "transcript.jsonl"

    if not metadata_path.exists():
        return None

    with open(metadata_path) as f:
        metadata = json.load(f)

    messages = []
    if messages_path.exists():
        with open(messages_path) as f:
            messages = json.load(f)

    # Enrich messages with tool responses from transcript if missing
    has_tool_responses = any(m.get("tool_response") for m in messages)
    if not has_tool_responses and transcript_path.exists():
        try:
            tool_responses = extract_tool_responses(transcript_path)
            enrich_messages_with_tool_responses(messages, tool_responses)
        except Exception:
            pass

    # Find all screenshots
    screenshots = sorted(task_dir.glob("screenshot*.jpg")) + sorted(
        task_dir.glob("screenshot*.png")
    )
    # Sort by number
    screenshots = sorted(
        screenshots, key=lambda p: int("".join(filter(str.isdigit, p.stem)) or 0)
    )

    return {
        "name": task_dir.name,
        "metadata": metadata,
        "messages": messages,
        "screenshots": screenshots,
    }


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes}m {secs}s"


def format_tokens(tokens: int) -> str:
    """Format token count with K/M suffix."""
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    if tokens >= 1_000:
        return f"{tokens / 1_000:.1f}K"
    return str(tokens)


def format_cost(input_tokens: int, output_tokens: int) -> str:
    """Calculate and format cost based on token usage.

    Pricing: $0.05 per 1M input tokens, $0.40 per 1M output tokens.
    """
    input_cost = (input_tokens / 1_000_000) * 0.05
    output_cost = (output_tokens / 1_000_000) * 0.40
    total_cost = input_cost + output_cost
    return f"${total_cost:.2f}"


def escape_html(text: str) -> str:
    """Escape HTML special characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def message_to_html(message: dict) -> str:
    """Convert a message to HTML."""
    role = message.get("role", "unknown")
    content = message.get("content", "")
    tool_response = message.get("tool_response", "")

    role_class = {"system": "system", "user": "user", "assistant": "assistant"}.get(
        role, "unknown"
    )

    role_label = {"system": "System", "user": "User", "assistant": "Assistant"}.get(
        role, role.title()
    )

    # Check if it's a tool call
    is_tool = content.startswith("Tool:")
    if is_tool:
        role_class = "tool"
        role_label = "Tool Call"

    escaped_content = escape_html(content)
    # Convert newlines to <br> for display
    escaped_content = escaped_content.replace("\n", "<br>")

    # Add inline tool response if present
    tool_response_html = ""
    if tool_response:
        escaped_response = escape_html(tool_response).replace("\n", "<br>")
        tool_response_html = f"""
        <div class="tool-response">
            <div class="tool-response-label">Response</div>
            <div class="tool-response-content">{escaped_response}</div>
        </div>
        """

    return f"""
    <div class="message {role_class}">
        <div class="message-role">{role_label}</div>
        <div class="message-content">{escaped_content}</div>
        {tool_response_html}
    </div>
    """


def generate_task_html(task: dict, task_index: int) -> str:
    """Generate HTML for a single task."""
    metadata = task["metadata"]
    messages = task["messages"]
    screenshots = task["screenshots"]

    task_id = metadata.get("task_id", task["name"])
    question = metadata.get("question", "N/A")
    start_url = metadata.get("start_url", "N/A")
    final_answer = metadata.get("final_answer", "N/A")
    duration = metadata.get("duration_seconds", 0)
    costs = metadata.get("costs", {})

    # Calculate total tokens
    alumnium_costs = costs.get("alumnium", {}).get("total", {})
    total_tokens = alumnium_costs.get("total_tokens", 0)
    input_tokens = alumnium_costs.get("input_tokens", 0)
    output_tokens = alumnium_costs.get("output_tokens", 0)

    # Screenshots gallery - use relative paths from report location
    screenshots_html = ""
    if screenshots:
        screenshots_html = '<div class="screenshots-gallery">'
        for i, screenshot in enumerate(screenshots):
            rel_path = f"{task['name']}/{screenshot.name}"
            screenshots_html += f"""
            <div class="screenshot-item">
                <img src="{rel_path}" alt="Screenshot {i + 1}" loading="lazy" onclick="openModal({task_index}, {i})">
                <div class="screenshot-label">Step {i + 1}</div>
            </div>
            """
        screenshots_html += "</div>"
    else:
        screenshots_html = '<p class="no-screenshots">No screenshots available</p>'

    # Messages/conversation
    messages_html = ""
    if messages:
        for msg in messages:
            messages_html += message_to_html(msg)
    else:
        messages_html = '<p class="no-messages">No conversation history available</p>'

    # Final answer - convert markdown-ish to HTML
    final_answer_html = escape_html(final_answer).replace("\n", "<br>")

    return f"""
    <div class="task" id="task-{task_index}">
        <div class="task-header" onclick="toggleTask({task_index})">
            <div class="task-title">
                <span class="task-toggle">▶</span>
                <h2>{escape_html(task_id)}</h2>
            </div>
            <div class="task-meta">
                <span class="meta-item duration">⏱️ {format_duration(duration)}</span>
                <span class="meta-item tokens">🔢 {format_tokens(total_tokens)} tokens</span>
            </div>
        </div>
        <div class="task-body" style="display: none;">
            <div class="task-info">
                <div class="info-row">
                    <strong>Question:</strong>
                    <span>{escape_html(question)}</span>
                </div>
                <div class="info-row">
                    <strong>Start URL:</strong>
                    <a href="{escape_html(start_url)}" target="_blank">{escape_html(start_url)}</a>
                </div>
                <div class="info-row">
                    <strong>Token Usage:</strong>
                    <span>Input: {format_tokens(input_tokens)} | Output: {format_tokens(output_tokens)} | Total: {format_tokens(total_tokens)}</span>
                </div>
            </div>

            <div class="section">
                <h3>📸 Screenshots</h3>
                {screenshots_html}
            </div>

            <div class="section">
                <h3>💬 Conversation</h3>
                <div class="conversation">
                    {messages_html}
                </div>
            </div>

            <div class="section">
                <h3>✅ Final Answer</h3>
                <div class="final-answer">
                    {final_answer_html}
                </div>
            </div>
        </div>
    </div>
    """


def generate_report(results_dir: Path, output_path: Path) -> None:
    """Generate the complete HTML report."""
    # Load all tasks
    tasks = []
    for task_dir in sorted(results_dir.iterdir()):
        if task_dir.is_dir() and task_dir.name.startswith("task"):
            task_data = load_task_data(task_dir)
            if task_data:
                tasks.append(task_data)

    # Calculate summary stats
    total_tasks = len(tasks)
    total_duration = sum(t["metadata"].get("duration_seconds", 0) for t in tasks)
    total_tokens = sum(
        t["metadata"]
        .get("costs", {})
        .get("alumnium", {})
        .get("total", {})
        .get("total_tokens", 0)
        for t in tasks
    )
    total_input_tokens = sum(
        t["metadata"]
        .get("costs", {})
        .get("alumnium", {})
        .get("total", {})
        .get("input_tokens", 0)
        for t in tasks
    )
    total_output_tokens = sum(
        t["metadata"]
        .get("costs", {})
        .get("alumnium", {})
        .get("total", {})
        .get("output_tokens", 0)
        for t in tasks
    )

    # Generate tasks HTML
    tasks_html = ""
    for i, task in enumerate(tasks):
        tasks_html += generate_task_html(task, i)

    # Generate complete HTML
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code Benchmark Report</title>
    <style>
        :root {{
            --bg-primary: #1a1a2e;
            --bg-secondary: #16213e;
            --bg-tertiary: #0f3460;
            --text-primary: #eee;
            --text-secondary: #aaa;
            --accent: #e94560;
            --accent-secondary: #0f3460;
            --border: #333;
            --success: #4caf50;
            --info: #2196f3;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 20px;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}

        header {{
            text-align: center;
            padding: 40px 20px;
            background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));
            border-radius: 12px;
            margin-bottom: 30px;
        }}

        header h1 {{
            font-size: 2.5em;
            margin-bottom: 10px;
            color: var(--accent);
        }}

        header .subtitle {{
            color: var(--text-secondary);
            font-size: 1.1em;
        }}

        .summary {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}

        .summary-card {{
            background: var(--bg-secondary);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid var(--border);
        }}

        .summary-card .value {{
            font-size: 2em;
            font-weight: bold;
            color: var(--accent);
        }}

        .summary-card .label {{
            color: var(--text-secondary);
            margin-top: 5px;
        }}

        .task {{
            background: var(--bg-secondary);
            border-radius: 8px;
            margin-bottom: 15px;
            border: 1px solid var(--border);
            overflow: hidden;
        }}

        .task-header {{
            padding: 15px 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-tertiary);
            transition: background 0.2s;
        }}

        .task-header:hover {{
            background: rgba(233, 69, 96, 0.1);
        }}

        .task-title {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .task-title h2 {{
            font-size: 1.2em;
            font-weight: 500;
        }}

        .task-toggle {{
            transition: transform 0.3s;
            color: var(--accent);
        }}

        .task.expanded .task-toggle {{
            transform: rotate(90deg);
        }}

        .task-meta {{
            display: flex;
            gap: 20px;
        }}

        .meta-item {{
            font-size: 0.9em;
            color: var(--text-secondary);
        }}

        .task-body {{
            padding: 20px;
        }}

        .task-info {{
            background: var(--bg-primary);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }}

        .info-row {{
            margin-bottom: 10px;
        }}

        .info-row:last-child {{
            margin-bottom: 0;
        }}

        .info-row strong {{
            color: var(--accent);
            margin-right: 10px;
        }}

        .info-row a {{
            color: var(--info);
            text-decoration: none;
        }}

        .info-row a:hover {{
            text-decoration: underline;
        }}

        .section {{
            margin-top: 25px;
        }}

        .section h3 {{
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border);
            color: var(--text-primary);
        }}

        .screenshots-gallery {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
        }}

        .screenshot-item {{
            position: relative;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border);
        }}

        .screenshot-item img {{
            width: 100%;
            height: 150px;
            object-fit: cover;
            cursor: pointer;
            transition: transform 0.2s;
        }}

        .screenshot-item img:hover {{
            transform: scale(1.02);
        }}

        .screenshot-label {{
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.7);
            padding: 5px;
            text-align: center;
            font-size: 0.85em;
        }}

        .conversation {{
            max-height: 500px;
            overflow-y: auto;
            padding: 10px;
            background: var(--bg-primary);
            border-radius: 8px;
        }}

        .message {{
            margin-bottom: 15px;
            padding: 12px;
            border-radius: 8px;
            border-left: 4px solid;
        }}

        .message.system {{
            background: rgba(33, 150, 243, 0.1);
            border-left-color: var(--info);
        }}

        .message.user {{
            background: rgba(233, 69, 96, 0.1);
            border-left-color: var(--accent);
        }}

        .message.assistant {{
            background: rgba(76, 175, 80, 0.1);
            border-left-color: var(--success);
        }}

        .message.tool {{
            background: rgba(255, 152, 0, 0.1);
            border-left-color: #ff9800;
            font-family: monospace;
            font-size: 0.9em;
        }}

        .message-role {{
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 0.85em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}

        .message.system .message-role {{ color: var(--info); }}
        .message.user .message-role {{ color: var(--accent); }}
        .message.assistant .message-role {{ color: var(--success); }}
        .message.tool .message-role {{ color: #ff9800; }}

        .message-content {{
            word-wrap: break-word;
        }}

        .final-answer {{
            background: var(--bg-primary);
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid var(--success);
        }}

        .no-screenshots, .no-messages {{
            color: var(--text-secondary);
            font-style: italic;
        }}

        /* Tool response inline */
        .tool-response {{
            margin-top: 8px;
            border-top: 1px solid rgba(255, 152, 0, 0.2);
            padding-top: 6px;
        }}

        .tool-response-label {{
            color: #ff9800;
            font-size: 0.85em;
            font-weight: 500;
            margin-bottom: 4px;
        }}

        .tool-response-content {{
            padding: 8px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.85em;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 300px;
            overflow-y: auto;
        }}

        /* Modal for full-size screenshots */
        .modal {{
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            justify-content: center;
            align-items: center;
            overflow: auto;
        }}

        .modal.active {{
            display: flex;
        }}

        .modal-image-container {{
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100%;
            padding: 60px 80px;
        }}

        .modal img {{
            max-width: 100%;
            max-height: calc(100vh - 120px);
            object-fit: contain;
        }}

        .modal-close {{
            position: fixed;
            top: 20px;
            right: 30px;
            font-size: 40px;
            color: white;
            cursor: pointer;
            z-index: 1001;
        }}

        .modal-nav {{
            position: fixed;
            top: 50%;
            transform: translateY(-50%);
            font-size: 48px;
            color: white;
            cursor: pointer;
            z-index: 1001;
            padding: 20px;
            user-select: none;
            opacity: 0.7;
            transition: opacity 0.2s;
        }}

        .modal-nav:hover {{
            opacity: 1;
        }}

        .modal-nav.disabled {{
            opacity: 0.2;
            cursor: default;
        }}

        .modal-nav.prev {{
            left: 10px;
        }}

        .modal-nav.next {{
            right: 10px;
        }}

        .modal-counter {{
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255,255,255,0.7);
            font-size: 14px;
            z-index: 1001;
            background: rgba(0,0,0,0.5);
            padding: 8px 16px;
            border-radius: 6px;
        }}

        /* Scrollbar styling */
        ::-webkit-scrollbar {{
            width: 8px;
            height: 8px;
        }}

        ::-webkit-scrollbar-track {{
            background: var(--bg-primary);
        }}

        ::-webkit-scrollbar-thumb {{
            background: var(--border);
            border-radius: 4px;
        }}

        ::-webkit-scrollbar-thumb:hover {{
            background: var(--text-secondary);
        }}

        @media (max-width: 768px) {{
            header h1 {{
                font-size: 1.8em;
            }}

            .task-header {{
                flex-direction: column;
                gap: 10px;
                align-items: flex-start;
            }}

            .task-meta {{
                flex-wrap: wrap;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🤖 Claude Code Benchmark Report</h1>
            <p class="subtitle">WebVoyager Benchmark Results • Generated {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
        </header>

        <div class="summary">
            <div class="summary-card">
                <div class="value">{total_tasks}</div>
                <div class="label">Total Tasks</div>
            </div>
            <div class="summary-card">
                <div class="value">{format_duration(total_duration)}</div>
                <div class="label">Total Duration</div>
            </div>
            <div class="summary-card">
                <div class="value">{format_tokens(total_tokens)}</div>
                <div class="label">Total Tokens</div>
            </div>
            <div class="summary-card">
                <div class="value">{format_cost(total_input_tokens, total_output_tokens)}</div>
                <div class="label">Estimated Cost</div>
            </div>
            <div class="summary-card">
                <div class="value">{format_duration(total_duration / total_tasks) if total_tasks > 0 else "N/A"}</div>
                <div class="label">Avg Duration/Task</div>
            </div>
        </div>

        <div class="tasks">
            {tasks_html}
        </div>
    </div>

    <!-- Modal for full-size screenshots with carousel -->
    <div class="modal" id="imageModal">
        <span class="modal-close" onclick="closeModal()">&times;</span>
        <span class="modal-nav prev" id="modalPrev" onclick="navigateImage(-1)">&#8249;</span>
        <span class="modal-nav next" id="modalNext" onclick="navigateImage(1)">&#8250;</span>
        <div class="modal-image-container" id="modalContainer">
            <img id="modalImage" src="" alt="Full size screenshot">
        </div>
        <div class="modal-counter" id="modalCounter">1 / 1</div>
    </div>

    <script>
        // Task screenshots data
        const taskScreenshots = {{}};

        function toggleTask(index) {{
            const task = document.getElementById('task-' + index);
            const body = task.querySelector('.task-body');
            const isExpanded = task.classList.contains('expanded');

            if (isExpanded) {{
                body.style.display = 'none';
                task.classList.remove('expanded');
            }} else {{
                body.style.display = 'block';
                task.classList.add('expanded');
            }}
        }}

        // Carousel state
        let currentTaskIndex = -1;
        let currentImageIndex = 0;

        function collectTaskScreenshots() {{
            // Collect all screenshot URLs for each task
            document.querySelectorAll('.task').forEach((task, taskIndex) => {{
                const screenshots = [];
                task.querySelectorAll('.screenshot-item img').forEach(img => {{
                    screenshots.push(img.src);
                }});
                taskScreenshots[taskIndex] = screenshots;
            }});
        }}

        function updateModalUI() {{
            const screenshots = taskScreenshots[currentTaskIndex] || [];
            const total = screenshots.length;
            const current = currentImageIndex + 1;

            document.getElementById('modalCounter').textContent = `${{current}} / ${{total}}`;

            const prevBtn = document.getElementById('modalPrev');
            const nextBtn = document.getElementById('modalNext');

            prevBtn.classList.toggle('disabled', currentImageIndex <= 0);
            nextBtn.classList.toggle('disabled', currentImageIndex >= total - 1);
        }}

        function openModal(taskIndex, imageIndex) {{
            collectTaskScreenshots();
            currentTaskIndex = taskIndex;
            currentImageIndex = imageIndex;

            const screenshots = taskScreenshots[taskIndex] || [];
            if (screenshots.length === 0) return;

            const modal = document.getElementById('imageModal');
            const img = document.getElementById('modalImage');
            img.src = screenshots[imageIndex];
            updateModalUI();
            modal.classList.add('active');
            event.stopPropagation();
        }}

        function closeModal() {{
            document.getElementById('imageModal').classList.remove('active');
            currentTaskIndex = -1;
            currentImageIndex = 0;
        }}

        function navigateImage(direction) {{
            const screenshots = taskScreenshots[currentTaskIndex] || [];
            const newIndex = currentImageIndex + direction;

            if (newIndex < 0 || newIndex >= screenshots.length) return;

            currentImageIndex = newIndex;
            document.getElementById('modalImage').src = screenshots[currentImageIndex];
            updateModalUI();
        }}

        // Close on background click (not on image/controls)
        document.getElementById('imageModal').addEventListener('click', function(e) {{
            if (e.target === this || e.target.id === 'modalContainer') closeModal();
        }});

        document.addEventListener('keydown', function(e) {{
            const modal = document.getElementById('imageModal');
            if (!modal.classList.contains('active')) return;

            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowLeft') navigateImage(-1);
            if (e.key === 'ArrowRight') navigateImage(1);
        }});
    </script>
</body>
</html>
"""

    with open(output_path, "w") as f:
        f.write(html)

    print(f"Report generated: {output_path}")
    print(f"  - {total_tasks} tasks")
    print(f"  - {format_duration(total_duration)} total duration")
    print(f"  - {format_tokens(total_tokens)} total tokens")
    print(f"  - {format_cost(total_input_tokens, total_output_tokens)} estimated cost")


def main():
    if len(sys.argv) < 2:
        results_dir = Path("results/claude-code")
    else:
        results_dir = Path(sys.argv[1])

    if not results_dir.exists():
        print(f"Error: Results directory not found: {results_dir}")
        sys.exit(1)

    output_path = results_dir / "report.html"
    generate_report(results_dir, output_path)


if __name__ == "__main__":
    main()
