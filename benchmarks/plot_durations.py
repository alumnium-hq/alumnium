#!/usr/bin/env python3
"""Plot duration of mcp__alumnium calls from benchmark transcripts."""

import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import matplotlib.pyplot as plt
import numpy as np


def parse_timestamp(ts: str) -> datetime:
    """Parse ISO timestamp."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def extract_durations(transcript_path: Path) -> list[dict]:
    """Extract tool call durations from a transcript file."""
    tool_calls = {}  # id -> {name, start_time}
    durations = []

    with open(transcript_path) as f:
        for line in f:
            entry = json.loads(line)

            # Look for assistant messages with tool_use
            if entry.get("type") == "assistant":
                message = entry.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if item.get("type") == "tool_use" and item.get("name", "").startswith("mcp__alumnium"):
                        tool_id = item.get("id")
                        tool_calls[tool_id] = {
                            "name": item["name"],
                            "start_time": parse_timestamp(entry["timestamp"]),
                            "input": item.get("input", {})
                        }

            # Look for user messages with tool_result
            if entry.get("type") == "user":
                message = entry.get("message", {})
                content = message.get("content", [])
                if isinstance(content, list):
                    for item in content:
                        if item.get("type") == "tool_result":
                            tool_id = item.get("tool_use_id")
                            if tool_id in tool_calls:
                                start = tool_calls[tool_id]["start_time"]
                                end = parse_timestamp(entry["timestamp"])
                                duration = (end - start).total_seconds()
                                durations.append({
                                    "name": tool_calls[tool_id]["name"],
                                    "duration": duration,
                                    "start_time": start,
                                    "input": tool_calls[tool_id]["input"]
                                })
                                del tool_calls[tool_id]

    return durations


def main():
    results_dir = Path("/Users/p0deje/Development/alumnium/benchmarks/results/claude-code")

    all_durations = []

    # Process all task directories
    for task_dir in results_dir.iterdir():
        if task_dir.is_dir() and task_dir.name.startswith("task"):
            transcript_path = task_dir / "transcript.jsonl"
            if transcript_path.exists():
                durations = extract_durations(transcript_path)
                all_durations.extend(durations)

    # Sort by start time
    all_durations.sort(key=lambda x: x["start_time"])

    # Print statistics
    print(f"Total calls: {len(all_durations)}")

    # Group by tool name for stats
    by_tool = defaultdict(list)
    for d in all_durations:
        tool_short_name = d["name"].replace("mcp__alumnium__", "")
        by_tool[tool_short_name].append(d["duration"])

    print("\nBy tool:")
    for tool, durations in sorted(by_tool.items()):
        avg = sum(durations) / len(durations)
        p50 = np.percentile(durations, 50)
        p90 = np.percentile(durations, 90)
        p95 = np.percentile(durations, 95)
        p99 = np.percentile(durations, 99)
        print(f"  {tool}: n={len(durations)}, avg={avg:.2f}s, p50={p50:.2f}s, p90={p90:.2f}s, p95={p95:.2f}s, p99={p99:.2f}s")

    # Create time series plot
    fig, axes = plt.subplots(2, 1, figsize=(14, 10))

    # Time series of all calls
    ax1 = axes[0]
    call_indices = range(len(all_durations))
    durations_list = [d["duration"] for d in all_durations]

    # Scatter plot of individual calls
    colors = {'do': '#1f77b4', 'get': '#ff7f0e', 'check': '#2ca02c', 'wait': '#d62728',
              'start_driver': '#9467bd', 'stop_driver': '#8c564b', 'fetch_accessibility_tree': '#e377c2'}

    for d, idx in zip(all_durations, call_indices):
        tool = d["name"].replace("mcp__alumnium__", "")
        color = colors.get(tool, '#7f7f7f')
        ax1.scatter(idx, d["duration"], c=color, alpha=0.5, s=20)

    # Calculate rolling percentiles
    window_size = 20
    if len(durations_list) >= window_size:
        p50_rolling = []
        p90_rolling = []
        p95_rolling = []
        p99_rolling = []
        x_rolling = []

        for i in range(window_size, len(durations_list) + 1):
            window = durations_list[i - window_size:i]
            p50_rolling.append(np.percentile(window, 50))
            p90_rolling.append(np.percentile(window, 90))
            p95_rolling.append(np.percentile(window, 95))
            p99_rolling.append(np.percentile(window, 99))
            x_rolling.append(i - 1)

        ax1.plot(x_rolling, p50_rolling, 'g-', linewidth=2, label=f'p50 (rolling {window_size})')
        ax1.plot(x_rolling, p90_rolling, 'y-', linewidth=2, label=f'p90 (rolling {window_size})')
        ax1.plot(x_rolling, p95_rolling, 'orange', linewidth=2, label=f'p95 (rolling {window_size})')
        ax1.plot(x_rolling, p99_rolling, 'r-', linewidth=2, label=f'p99 (rolling {window_size})')

    # Add global percentile lines
    overall_p50 = np.percentile(durations_list, 50)
    overall_p90 = np.percentile(durations_list, 90)
    overall_p95 = np.percentile(durations_list, 95)
    overall_p99 = np.percentile(durations_list, 99)

    ax1.axhline(overall_p50, color='green', linestyle='--', alpha=0.7, label=f'Global p50: {overall_p50:.1f}s')
    ax1.axhline(overall_p90, color='yellow', linestyle='--', alpha=0.7, label=f'Global p90: {overall_p90:.1f}s')
    ax1.axhline(overall_p95, color='orange', linestyle='--', alpha=0.7, label=f'Global p95: {overall_p95:.1f}s')
    ax1.axhline(overall_p99, color='red', linestyle='--', alpha=0.7, label=f'Global p99: {overall_p99:.1f}s')

    ax1.set_xlabel("Call Index (chronological)")
    ax1.set_ylabel("Duration (seconds)")
    ax1.set_title("mcp__alumnium Call Durations - Time Series with Percentiles")
    ax1.legend(loc='upper right', fontsize=8)
    ax1.grid(True, alpha=0.3)

    # Per-tool percentile bar chart
    ax2 = axes[1]
    tools = ['do', 'get', 'check', 'wait', 'start_driver', 'stop_driver', 'fetch_accessibility_tree']
    tools = [t for t in tools if t in by_tool]

    x = np.arange(len(tools))
    width = 0.2

    p50_vals = [np.percentile(by_tool[t], 50) for t in tools]
    p90_vals = [np.percentile(by_tool[t], 90) for t in tools]
    p95_vals = [np.percentile(by_tool[t], 95) for t in tools]
    p99_vals = [np.percentile(by_tool[t], 99) for t in tools]

    ax2.bar(x - 1.5*width, p50_vals, width, label='p50', color='green', alpha=0.8)
    ax2.bar(x - 0.5*width, p90_vals, width, label='p90', color='yellow', alpha=0.8)
    ax2.bar(x + 0.5*width, p95_vals, width, label='p95', color='orange', alpha=0.8)
    ax2.bar(x + 1.5*width, p99_vals, width, label='p99', color='red', alpha=0.8)

    ax2.set_xlabel("Tool")
    ax2.set_ylabel("Duration (seconds)")
    ax2.set_title("mcp__alumnium Percentiles by Tool")
    ax2.set_xticks(x)
    ax2.set_xticklabels([f"{t}\n(n={len(by_tool[t])})" for t in tools])
    ax2.legend()
    ax2.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    plt.savefig("/Users/p0deje/Development/alumnium/benchmarks/results/duration_chart.png", dpi=150)
    print(f"\nChart saved to: benchmarks/results/duration_chart.png")
    plt.show()


if __name__ == "__main__":
    main()
