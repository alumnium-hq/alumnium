#!/usr/bin/env python3
"""
Patches the WebVoyager dataset to fix outdated/impossible tasks.

The patches.json file follows this format:
{
    "TaskId--N": {
        "reason": "explanation for the patch",
        "prev": "original task text (for verification)",
        "new": "updated task text"
    },
    "TaskId--M": {
        "reason": "explanation for removal",
        "remove": true
    }
}

Usage:
    python patch_dataset.py [--patches patches.json] [--input WebVoyager_data.jsonl] [--output patched_data.jsonl]
"""

import argparse
import json
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file into a list of dictionaries."""
    tasks = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                tasks.append(json.loads(line))
    return tasks


def save_jsonl(tasks: list[dict], path: Path) -> None:
    """Save a list of dictionaries to a JSONL file."""
    with open(path, "w", encoding="utf-8") as f:
        for task in tasks:
            f.write(json.dumps(task, ensure_ascii=False) + "\n")


def load_patches(path: Path) -> dict:
    """Load patches from a JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def apply_patches(
    tasks: list[dict],
    patches: dict,
    verify: bool = True,
) -> tuple[list[dict], dict]:
    """
    Apply patches to tasks.

    Returns:
        Tuple of (patched_tasks, stats)
    """
    stats = {
        "total": len(tasks),
        "modified": 0,
        "removed": 0,
        "skipped": 0,
        "errors": [],
    }

    patched_tasks = []

    for task in tasks:
        task_id = task.get("id")

        if task_id not in patches:
            patched_tasks.append(task)
            continue

        patch = patches[task_id]

        # Handle removal
        if patch.get("remove"):
            stats["removed"] += 1
            print(f"  Removed: {task_id} - {patch.get('reason', 'No reason')}")
            continue

        # Handle modification
        if "new" in patch:
            original_ques = task.get("ques", "")

            # Verify the original text matches if verification is enabled
            if verify and "prev" in patch:
                if patch["prev"] != original_ques:
                    error_msg = (
                        f"Mismatch for {task_id}: "
                        f"expected '{patch['prev'][:50]}...', "
                        f"got '{original_ques[:50]}...'"
                    )
                    stats["errors"].append(error_msg)
                    print(f"  Error: {error_msg}")
                    stats["skipped"] += 1
                    patched_tasks.append(task)
                    continue

            # Apply the patch
            patched_task = task.copy()
            patched_task["ques"] = patch["new"]
            patched_tasks.append(patched_task)
            stats["modified"] += 1
            print(f"  Modified: {task_id} - {patch.get('reason', 'No reason')}")
        else:
            # Patch exists but has neither 'new' nor 'remove'
            stats["skipped"] += 1
            patched_tasks.append(task)

    return patched_tasks, stats


def main():
    parser = argparse.ArgumentParser(
        description="Patch WebVoyager dataset with fixes for outdated/impossible tasks"
    )
    parser.add_argument(
        "--patches",
        type=Path,
        default=Path(__file__).parent / "patches.json",
        help="Path to patches.json file",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).parent / "webvoyager" / "data" / "WebVoyager_data.jsonl",
        help="Path to original WebVoyager_data.jsonl",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Path to output patched file (defaults to input path, overwriting)",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip verification of original text before patching",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without writing output",
    )

    args = parser.parse_args()

    if args.output is None:
        args.output = args.input

    print(f"Loading tasks from {args.input}")
    tasks = load_jsonl(args.input)
    print(f"  Loaded {len(tasks)} tasks")

    print(f"Loading patches from {args.patches}")
    patches = load_patches(args.patches)
    print(f"  Loaded {len(patches)} patches")

    print("\nApplying patches:")
    patched_tasks, stats = apply_patches(
        tasks,
        patches,
        verify=not args.no_verify,
    )

    print(f"\nSummary:")
    print(f"  Total tasks: {stats['total']}")
    print(f"  Modified: {stats['modified']}")
    print(f"  Removed: {stats['removed']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Final count: {len(patched_tasks)}")

    if stats["errors"]:
        print(f"\nErrors ({len(stats['errors'])}):")
        for error in stats["errors"]:
            print(f"  - {error}")

    if args.dry_run:
        print("\nDry run - no files written")
    else:
        print(f"\nWriting patched dataset to {args.output}")
        save_jsonl(patched_tasks, args.output)
        print("Done!")


if __name__ == "__main__":
    main()
