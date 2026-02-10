#!/usr/bin/env python3
"""Run WebVoyager benchmark task with Claude Code and Alumnium MCP.

This script:
1. Loads a task from the WebVoyager dataset
2. Starts a Claude Code session with the task prompt
3. Claude Code uses Alumnium MCP tools to browse and complete the task
4. Session hooks collect artifacts (transcript, screenshots, metrics)

Usage:
    python run_claude_code.py Allrecipes--0
    python run_claude_code.py --list-tasks
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent  # benchmarks/
DATA_FILE = SCRIPT_DIR / "webvoyager" / "data" / "WebVoyager_data.jsonl"
RESULTS_DIR = SCRIPT_DIR / "results" / "claude-code"

# SYSTEM_PROMPT = """You are a web automation agent completing a browsing task.

# You have access to Alumnium browser automation tools:
# - mcp__alumnium__start_driver: Initialize a Chrome browser
# - mcp__alumnium__do: Execute browser actions using natural language (click, type, scroll, navigate to url)
# - mcp__alumnium__check: Verify conditions on the page
# - mcp__alumnium__get: Extract data from the page
# - mcp__alumnium__wait: Wait for conditions or time delays
# - mcp__alumnium__stop_driver: Close browser and save artifacts

# IMPORTANT INSTRUCTIONS:
# 1. First, call start_driver with capabilities: {"platformName": "chrome"}
# 2. Then navigate to the starting URL using the do tool
# 3. Complete the task step by step using natural language commands
# 4. When you have found the answer, state it clearly with "FINAL ANSWER: <your answer>"
# 5. Always call stop_driver with capture_screenshot=true when finished

# Only use the Alumnium MCP tools for browser automation. Do not use any file editing or other tools.
# """


def load_task(task_id: str) -> dict:
    """Load a task from WebVoyager dataset by ID."""
    with open(DATA_FILE) as f:
        for line in f:
            task = json.loads(line)
            if task["id"] == task_id:
                return task
    raise ValueError(f"Task '{task_id}' not found in dataset")


def list_tasks(web_filter: str | None = None) -> None:
    """List all available tasks."""
    with open(DATA_FILE) as f:
        for line in f:
            task = json.loads(line)
            if web_filter and task["web_name"].lower() != web_filter.lower():
                continue
            # Truncate question for display
            question = (
                task["ques"][:70] + "..." if len(task["ques"]) > 70 else task["ques"]
            )
            print(f"{task['id']}: {question}")


def run_task(task_id: str, timeout: int = 600) -> dict | None:
    """Run a single WebVoyager task with Claude Code."""
    import shutil

    task = load_task(task_id)

    # Clean and create output directory
    output_dir = RESULTS_DIR / f"task{task['id']}"
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build user prompt
    user_prompt = f"You are a browser agent for {task['web']}. {task['ques']}"
    # user_prompt = f"""You are a browser agent capable of using tools to browse the web and complete tasks.

    # Task: {task["ques"]}
    # Starting URL: {task["web"]}

    # When you have found the answer, state it as:
    # FINAL ANSWER: <your answer>"""

    # Set environment variables for hooks
    env = os.environ.copy()
    env.update(
        {
            "WEBVOYAGER_TASK_ID": task_id,
            "WEBVOYAGER_OUTPUT_DIR": str(output_dir.resolve()),
            "WEBVOYAGER_QUESTION": task["ques"],
            "WEBVOYAGER_URL": task["web"],
        }
    )

    # Build Claude Code command
    # Use local .mcp.json in benchmarks/ (has correct paths for running from here)
    cmd = [
        "claude",
        "--model",
        "sonnet",
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--mcp-config",
        ".mcp.json",
        "--allowed-tools",
        "mcp__alumnium",
        "--permission-mode",
        "dontAsk",
        user_prompt,
    ]

    print(f"Running task: {task_id}")
    print(f"Question: {task['ques']}")
    print(f"URL: {task['web']}")
    print(f"Output: {output_dir}")
    print(f"Command: {' '.join(cmd)}")
    print("-" * 60)

    # Run Claude Code from benchmarks/ directory
    # This ensures .claude/settings.json hooks are picked up
    try:
        result = subprocess.run(
            cmd,
            env=env,
            cwd=str(SCRIPT_DIR),  # Run from benchmarks/
            timeout=timeout,
            capture_output=False,  # Let output stream to terminal
        )
        if result.returncode != 0:
            print(f"\nClaude Code exited with code {result.returncode}")
    except subprocess.TimeoutExpired:
        print(f"\nTask timed out after {timeout} seconds")
    except KeyboardInterrupt:
        print("\nTask interrupted by user")

    print("-" * 60)

    # Results are collected by SessionEnd hook
    metadata_file = output_dir / "metadata.json"
    if metadata_file.exists():
        metadata = json.loads(metadata_file.read_text())
        print(f"\nResults:")
        print(f"  Final Answer: {metadata.get('final_answer', 'N/A')}")
        print(f"  Duration: {metadata.get('duration_seconds', 'N/A')}s")
        return metadata
    else:
        print("\nNo results collected (hooks may not have run)")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Run WebVoyager benchmark task with Claude Code",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_claude_code.py Allrecipes--0
  python run_claude_code.py Allrecipes--0 Allrecipes--1 Allrecipes--2
  python run_claude_code.py --list-tasks
  python run_claude_code.py --list-tasks --web Amazon
        """,
    )
    parser.add_argument(
        "task_ids",
        nargs="*",
        help="Task ID(s) (e.g., 'Allrecipes--0', 'Amazon--5')",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Timeout in seconds (default: 600)",
    )
    parser.add_argument(
        "--list-tasks",
        action="store_true",
        help="List all available task IDs",
    )
    parser.add_argument(
        "--web",
        type=str,
        help="Filter tasks by website name (used with --list-tasks)",
    )

    args = parser.parse_args()

    if args.list_tasks:
        list_tasks(args.web)
        return

    if not args.task_ids:
        parser.error("task_id(s) required (or use --list-tasks)")

    # Run tasks sequentially
    results = []
    for i, task_id in enumerate(args.task_ids, 1):
        print(f"\n{'=' * 60}")
        print(f"Task {i}/{len(args.task_ids)}: {task_id}")
        print(f"{'=' * 60}\n")
        try:
            result = run_task(task_id, args.timeout)
            results.append((task_id, result))
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            results.append((task_id, None))

    # Print summary if multiple tasks
    if len(args.task_ids) > 1:
        print(f"\n{'=' * 60}")
        print("SUMMARY")
        print(f"{'=' * 60}")
        for task_id, result in results:
            if result:
                status = "OK" if result.get("final_answer") else "NO ANSWER"
                print(f"  {task_id}: {status}")
            else:
                print(f"  {task_id}: FAILED")


if __name__ == "__main__":
    main()
