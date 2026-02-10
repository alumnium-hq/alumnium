#!/usr/bin/env python3
"""SessionEnd hook for WebVoyager benchmark.

Collects artifacts, calculates metrics, and saves results.
"""

import json
import os
import shutil
import sys
import time
from pathlib import Path

# Alumnium artifacts location - check multiple possible paths
# since MCP server may run from different directories
SCRIPT_DIR = Path(__file__).parent.parent  # benchmarks/
PROJECT_ROOT = SCRIPT_DIR.parent  # alumnium root
POSSIBLE_ARTIFACT_DIRS = [
    PROJECT_ROOT / "tmp" / "alumnium",  # If MCP runs from project root
    PROJECT_ROOT
    / "packages"
    / "python"
    / "tmp"
    / "alumnium",  # If MCP runs from packages/python
    Path("tmp/alumnium"),  # Relative to cwd
]


def find_driver_artifacts() -> Path | None:
    """Find the most recent Alumnium artifacts directory."""
    # Search in all possible artifact locations
    for artifacts_dir in POSSIBLE_ARTIFACT_DIRS:
        if not artifacts_dir.exists():
            continue

        # Find most recent artifacts dir (newest first)
        dirs = [d for d in artifacts_dir.iterdir() if d.is_dir()]
        if not dirs:
            continue

        dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return dirs[0]

    return None


def extract_final_answer(transcript_path: str) -> str | None:
    """Extract FINAL ANSWER from transcript."""
    try:
        with open(transcript_path) as f:
            for line in reversed(f.readlines()):
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") == "assistant":
                    content = entry.get("message", {}).get("content", [])
                    for block in content:
                        if block.get("type") == "text":
                            text = block.get("text", "")
                            if text:
                                return text
    except Exception:
        pass

    return None


def calculate_costs(transcript_path: str, token_stats_path: Path | None) -> dict:
    """Calculate Claude Code and Alumnium token costs."""
    costs = {
        "claude_code": {"input_tokens": 0, "output_tokens": 0},
        "alumnium": {"total": {}, "cache": {}},
    }

    # Parse Claude Code costs from transcript
    try:
        with open(transcript_path) as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Look for usage metadata in various message types
                usage = entry.get("usage", {})
                if usage:
                    costs["claude_code"]["input_tokens"] += usage.get("input_tokens", 0)
                    costs["claude_code"]["output_tokens"] += usage.get(
                        "output_tokens", 0
                    )
    except Exception:
        pass

    # Parse Alumnium costs from token-stats.json
    if token_stats_path and token_stats_path.exists():
        try:
            stats = json.loads(token_stats_path.read_text())
            costs["alumnium"] = stats
        except Exception:
            pass

    return costs


def convert_to_interact_messages(
    transcript_path: str, task_question: str, task_url: str, final_answer: str | None
) -> list:
    """Convert transcript to auto_eval.py compatible format."""
    messages = [
        {"role": "system", "content": "Claude Code WebVoyager benchmark"},
        {
            "role": "user",
            "content": f"Now given a task: {task_question} Please interact with {task_url} and get the answer.",
        },
    ]

    try:
        with open(transcript_path) as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") == "assistant":
                    content = entry.get("message", {}).get("content", [])
                    text_parts = []
                    for block in content:
                        if block.get("type") == "text":
                            text_parts.append(block["text"])
                        elif block.get("type") == "tool_use":
                            tool_name = block.get("name", "unknown")
                            tool_input = block.get("input", {})
                            text_parts.append(
                                f"Tool: {tool_name}({json.dumps(tool_input)})"
                            )

                    if text_parts:
                        messages.append(
                            {"role": "assistant", "content": "\n".join(text_parts)}
                        )
    except Exception:
        pass

    # Add final answer in expected format for auto_eval.py
    if final_answer:
        messages.append(
            {"role": "assistant", "content": f"Action: ANSWER; {final_answer}"}
        )

    return messages


def main():
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        return  # Invalid input, skip

    # Get task info from environment
    task_id = os.environ.get("WEBVOYAGER_TASK_ID")
    output_dir = os.environ.get("WEBVOYAGER_OUTPUT_DIR")

    if not task_id or not output_dir:
        return  # Not a benchmark run, skip

    output_path = Path(output_dir)
    session_file = output_path / ".session_metadata.json"

    if not session_file.exists():
        return  # No session metadata from SessionStart

    # Load session metadata
    try:
        metadata = json.loads(session_file.read_text())
    except Exception:
        return

    end_time = time.time()
    duration = end_time - metadata.get("start_time", end_time)
    transcript_path = metadata.get("transcript_path", "")

    # Find Alumnium artifacts
    artifacts_dir = find_driver_artifacts()

    # Copy transcript
    if transcript_path and Path(transcript_path).exists():
        shutil.copy(transcript_path, output_path / "transcript.jsonl")

    # Copy Alumnium artifacts
    token_stats_path = None
    if artifacts_dir:
        # Copy screenshots
        screenshots_dir = artifacts_dir / "screenshots"
        if screenshots_dir.exists():
            for i, src in enumerate(sorted(screenshots_dir.glob("*.png")), 1):
                shutil.copy(src, output_path / f"screenshot{i}.png")

        # Copy final screenshot (full-page)
        final_screenshot = artifacts_dir / "final_screenshot.png"
        if final_screenshot.exists():
            shutil.copy(final_screenshot, output_path / "final_screenshot.png")

        # Note token stats path
        token_stats_path = artifacts_dir / "token-stats.json"
        if token_stats_path.exists():
            shutil.copy(token_stats_path, output_path / "alumnium-token-stats.json")

    # Load task data from environment
    task_question = os.environ.get("WEBVOYAGER_QUESTION", "")
    task_url = os.environ.get("WEBVOYAGER_URL", "")

    # Extract answer and calculate costs
    final_answer = extract_final_answer(transcript_path) if transcript_path else None
    costs = (
        calculate_costs(transcript_path, token_stats_path) if transcript_path else {}
    )

    # Convert to interact_messages format for auto_eval.py
    if transcript_path:
        interact_messages = convert_to_interact_messages(
            transcript_path, task_question, task_url, final_answer
        )
        (output_path / "interact_messages.json").write_text(
            json.dumps(interact_messages, indent=2)
        )

    # Save metadata
    result_metadata = {
        "task_id": task_id,
        "question": task_question,
        "start_url": task_url,
        "final_answer": final_answer,
        "duration_seconds": round(duration, 2),
        "costs": costs,
        "session_id": metadata.get("session_id"),
    }
    (output_path / "metadata.json").write_text(json.dumps(result_metadata, indent=2))

    # Cleanup session file
    try:
        session_file.unlink()
    except Exception:
        pass


if __name__ == "__main__":
    main()
