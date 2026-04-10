from __future__ import annotations

import asyncio
import subprocess
import sys
from collections.abc import Sequence
from typing import Any

from alumnium_cli import bin_path

_SUBPROCESS_KWARGS = {"check", "capture_output", "text", "env", "cwd"}


# region Main


def main(argv: Sequence[str] | None = None) -> int:
    actual_argv = list(sys.argv[1:] if argv is None else argv)
    return run(actual_argv).returncode


# endregion


# region Run


def run(
    args: Sequence[str],
    *,
    check: bool = False,
    capture_output: bool = False,
    text: bool = True,
    env: subprocess._ENV | None = None,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    command = [str(bin_path()), *args]
    return subprocess.run(command, check=check, capture_output=capture_output, text=text, env=env, cwd=cwd)


async def run_async(
    args: Sequence[str],
    *,
    check: bool = False,
    capture_output: bool = False,
    text: bool = True,
    env: subprocess._ENV | None = None,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return await asyncio.to_thread(
        run,
        args,
        check=check,
        capture_output=capture_output,
        text=text,
        env=env,
        cwd=cwd,
    )


# endregion


# region Server


def run_server(**kwargs: Any) -> subprocess.CompletedProcess[str]:
    subprocess_kwargs, alumnium_kwargs = _split_kwargs(kwargs)
    return run(_build_args("server", alumnium_kwargs), **subprocess_kwargs)


async def run_server_async(**kwargs: Any) -> subprocess.CompletedProcess[str]:
    subprocess_kwargs, alumnium_kwargs = _split_kwargs(kwargs)
    return await run_async(_build_args("server", alumnium_kwargs), **subprocess_kwargs)


# endregion


# region MCP


def run_mcp(**kwargs: Any) -> subprocess.CompletedProcess[str]:
    subprocess_kwargs, alumnium_kwargs = _split_kwargs(kwargs)
    return run(_build_args("mcp", alumnium_kwargs), **subprocess_kwargs)


async def run_mcp_async(**kwargs: Any) -> subprocess.CompletedProcess[str]:
    subprocess_kwargs, alumnium_kwargs = _split_kwargs(kwargs)
    return await run_async(_build_args("mcp", alumnium_kwargs), **subprocess_kwargs)


# endregion


# region Internals


def _split_kwargs(kwargs: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    subprocess_kwargs: dict[str, Any] = {}
    alumnium_kwargs: dict[str, Any] = {}
    for key, value in kwargs.items():
        if key in _SUBPROCESS_KWARGS:
            subprocess_kwargs[key] = value
        else:
            alumnium_kwargs[key] = value
    return subprocess_kwargs, alumnium_kwargs


def _build_args(subcommand: str, kwargs: dict[str, Any]) -> list[str]:
    args = [subcommand]
    for key, value in kwargs.items():
        if value is None:
            continue
        flag = "--" + key.replace("_", "-")
        if isinstance(value, bool):
            args.append(flag if value else f"{flag}=false")
        else:
            args.extend((flag, str(value)))
    return args


# endregion

__all__ = [
    "bin_path",
    "main",
    "run",
    "run_async",
    "run_server",
    "run_server_async",
    "run_mcp",
    "run_mcp_async",
]
