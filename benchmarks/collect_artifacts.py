#!/usr/bin/env python3
"""Collect WebVoyager benchmark artifacts after a Claude Code session.

Called by run_claude_code.py after the subprocess finishes (whether normally,
by timeout, or by interrupt). This replaces the previous SessionEnd hook
approach, ensuring artifacts are always collected.
"""

import json
import re
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent  # alumnium root
POSSIBLE_ARTIFACT_DIRS = [
    PROJECT_ROOT / "tmp" / "alumnium",
    PROJECT_ROOT / "packages" / "python" / "tmp" / "alumnium",
    Path("tmp/alumnium"),
]


def find_driver_artifacts(driver_id: str) -> Path | None:
    """Find Alumnium artifacts directory for a specific driver_id."""
    for artifacts_dir in POSSIBLE_ARTIFACT_DIRS:
        driver_dir = artifacts_dir / driver_id
        if driver_dir.exists() and driver_dir.is_dir():
            return driver_dir
    return None


def extract_driver_id(transcript_path: str) -> str | None:
    """Extract driver_id from start_driver tool result in transcript."""
    try:
        with open(transcript_path) as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") != "user":
                    continue

                # Check toolUseResult field (easier to parse)
                tool_result = entry.get("toolUseResult", [])
                for result in tool_result:
                    if isinstance(result, dict) and result.get("type") == "text":
                        text = result.get("text", "")
                        match = re.search(r"driver_id:\s*(\S+)", text)
                        if match:
                            return match.group(1).rstrip(")")

                # Fallback: check message.content for tool_result
                content = entry.get("message", {}).get("content", [])
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        result_content = block.get("content", [])
                        for rc in result_content:
                            if isinstance(rc, dict) and rc.get("type") == "text":
                                text = rc.get("text", "")
                                match = re.search(r"driver_id:\s*(\S+)", text)
                                if match:
                                    return match.group(1).rstrip(")")
    except Exception:
        pass

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

                usage = entry.get("usage", {})
                if usage:
                    costs["claude_code"]["input_tokens"] += usage.get(
                        "input_tokens", 0
                    )
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
        pending_tool_calls = {}  # tool_use_id -> message dict

        with open(transcript_path) as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") == "assistant":
                    content = entry.get("message", {}).get("content", [])
                    text_parts = []
                    tool_use_ids = []
                    for block in content:
                        if block.get("type") == "text":
                            text_parts.append(block["text"])
                        elif block.get("type") == "tool_use":
                            tool_name = block.get("name", "unknown")
                            tool_input = block.get("input", {})
                            text_parts.append(
                                f"Tool: {tool_name}({json.dumps(tool_input)})"
                            )
                            if block.get("id"):
                                tool_use_ids.append(block["id"])

                    if text_parts:
                        msg = {
                            "role": "assistant",
                            "content": "\n".join(text_parts),
                        }
                        messages.append(msg)
                        for tid in tool_use_ids:
                            pending_tool_calls[tid] = msg

                elif entry.get("type") == "user":
                    msg_content = entry.get("message", {}).get("content", [])
                    if isinstance(msg_content, list):
                        for block in msg_content:
                            if (
                                isinstance(block, dict)
                                and block.get("type") == "tool_result"
                            ):
                                tid = block.get("tool_use_id")
                                result_parts = block.get("content", [])
                                result_text = ""
                                for rc in result_parts:
                                    if (
                                        isinstance(rc, dict)
                                        and rc.get("type") == "text"
                                    ):
                                        result_text += rc.get("text", "")

                                if tid and tid in pending_tool_calls and result_text:
                                    pending_tool_calls[tid][
                                        "tool_response"
                                    ] = result_text
                                    del pending_tool_calls[tid]
    except Exception:
        pass

    # Add final answer in expected format for auto_eval.py
    if final_answer:
        messages.append(
            {"role": "assistant", "content": f"Action: ANSWER; {final_answer}"}
        )

    return messages


def collect_artifacts(
    task_id: str,
    output_dir: Path,
    question: str,
    url: str,
    start_time: float,
    end_time: float,
) -> dict | None:
    """Collect benchmark artifacts and generate report metadata.

    Returns metadata dict if successful, None otherwise.
    """
    # Load session metadata (from SessionStart hook)
    session_file = output_dir / ".session_metadata.json"
    transcript_path = None
    session_id = None

    if session_file.exists():
        try:
            metadata = json.loads(session_file.read_text())
            transcript_path = metadata.get("transcript_path")
            session_id = metadata.get("session_id")
        except Exception:
            pass

    # Extract driver_id from transcript
    artifacts_dir = None
    if transcript_path:
        driver_id = extract_driver_id(transcript_path)
        if driver_id:
            artifacts_dir = find_driver_artifacts(driver_id)

    duration = end_time - start_time

    # Copy transcript
    if transcript_path and Path(transcript_path).exists():
        shutil.copy(transcript_path, output_dir / "transcript.jsonl")

    # Copy Alumnium artifacts
    token_stats_path = None
    if artifacts_dir:
        # Copy screenshots
        screenshots_dir = artifacts_dir / "screenshots"
        if screenshots_dir.exists():
            for i, src in enumerate(sorted(screenshots_dir.glob("*.jpg")), 1):
                shutil.copy(src, output_dir / f"screenshot{i}.jpg")

        # Note token stats path
        token_stats_path = artifacts_dir / "token-stats.json"
        if token_stats_path.exists():
            shutil.copy(token_stats_path, output_dir / "alumnium-token-stats.json")

    # Extract answer and calculate costs
    final_answer = extract_final_answer(transcript_path) if transcript_path else None
    costs = (
        calculate_costs(transcript_path, token_stats_path) if transcript_path else {}
    )

    # Convert to interact_messages format for auto_eval.py
    if transcript_path:
        interact_messages = convert_to_interact_messages(
            transcript_path, question, url, final_answer
        )
        (output_dir / "interact_messages.json").write_text(
            json.dumps(interact_messages, indent=2)
        )

    # Save metadata
    result_metadata = {
        "task_id": task_id,
        "question": question,
        "start_url": url,
        "final_answer": final_answer,
        "duration_seconds": round(duration, 2),
        "costs": costs,
        "session_id": session_id,
    }
    (output_dir / "metadata.json").write_text(json.dumps(result_metadata, indent=2))

    # Cleanup temp files
    try:
        session_file.unlink()
    except Exception:
        pass

    return result_metadata


def recollect_artifacts(task_dir: Path) -> bool:
    """Re-collect artifacts for an existing task directory.

    Uses existing transcript.jsonl to extract driver_id and copy artifacts.
    Returns True if artifacts were found and copied.
    """
    transcript_path = task_dir / "transcript.jsonl"
    if not transcript_path.exists():
        print(f"  No transcript found")
        return False

    driver_id = extract_driver_id(str(transcript_path))
    if not driver_id:
        print(f"  Could not extract driver_id from transcript")
        return False

    print(f"  driver_id: {driver_id}")

    artifacts_dir = find_driver_artifacts(driver_id)
    if not artifacts_dir:
        print(f"  Artifacts directory not found")
        return False

    print(f"  Artifacts: {artifacts_dir}")

    # Copy screenshots
    screenshots_dir = artifacts_dir / "screenshots"
    if screenshots_dir.exists():
        count = 0
        for i, src in enumerate(sorted(screenshots_dir.glob("*.jpg")), 1):
            shutil.copy(src, task_dir / f"screenshot{i}.jpg")
            count += 1
        print(f"  Copied {count} screenshots")

    # Copy token stats and update metadata
    token_stats_path = artifacts_dir / "token-stats.json"
    if token_stats_path.exists():
        shutil.copy(token_stats_path, task_dir / "alumnium-token-stats.json")
        print(f"  Copied token-stats.json")

        # Update metadata.json with token stats
        metadata_path = task_dir / "metadata.json"
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text())
                token_stats = json.loads(token_stats_path.read_text())
                metadata["costs"]["alumnium"] = token_stats
                metadata_path.write_text(json.dumps(metadata, indent=2))
                print(f"  Updated metadata.json with token stats")
            except Exception as e:
                print(f"  Failed to update metadata: {e}")

    return True


def main():
    """CLI to re-collect artifacts for existing task results."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Re-collect Alumnium artifacts for existing benchmark results"
    )
    parser.add_argument(
        "task_dirs",
        nargs="*",
        help="Task directories to process (default: all in results/claude-code/)",
    )
    args = parser.parse_args()

    results_dir = Path(__file__).parent / "results" / "claude-code"

    if args.task_dirs:
        task_dirs = [Path(d) for d in args.task_dirs]
    else:
        task_dirs = sorted(results_dir.glob("task*"))

    print(f"Processing {len(task_dirs)} task directories...\n")

    success = 0
    for task_dir in task_dirs:
        print(f"{task_dir.name}:")
        if recollect_artifacts(task_dir):
            success += 1
        print()

    print(f"Done: {success}/{len(task_dirs)} tasks had artifacts collected")


if __name__ == "__main__":
    main()
