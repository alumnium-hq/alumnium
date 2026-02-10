#!/usr/bin/env python3
"""SessionStart hook for WebVoyager benchmark.

Records session start time and paths for later artifact collection.
"""

import json
import os
import sys
import time
from pathlib import Path


def main():
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        return  # Invalid input, skip

    session_id = hook_input.get("session_id")
    transcript_path = hook_input.get("transcript_path")

    if not session_id or not transcript_path:
        return  # Missing required fields

    # Get task info from environment (set by run_claude_code.py)
    task_id = os.environ.get("WEBVOYAGER_TASK_ID")
    output_dir = os.environ.get("WEBVOYAGER_OUTPUT_DIR")

    if not task_id or not output_dir:
        return  # Not a benchmark run, skip

    # Store session metadata for SessionEnd hook
    metadata = {
        "session_id": session_id,
        "transcript_path": transcript_path,
        "task_id": task_id,
        "output_dir": output_dir,
        "start_time": time.time(),
    }

    # Write to temp file in output directory for SessionEnd hook
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    session_file = output_path / ".session_metadata.json"
    session_file.write_text(json.dumps(metadata, indent=2))

    # Sleep few seconds to let MCP server to start.
    # https://github.com/anthropics/claude-code/issues/723
    time.sleep(5)


if __name__ == "__main__":
    main()
