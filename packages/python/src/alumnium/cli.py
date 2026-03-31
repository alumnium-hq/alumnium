from __future__ import annotations

import asyncio
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

from alumnium_cli import bin_path

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


def run_server(
    *,
    host: str | None = None,
    port: int | None = None,
    daemon: bool | None = None,
    daemon_kill: bool | None = None,
    daemon_pid: str | None = None,
    daemon_force: bool | None = None,
    daemon_wait: bool | None = None,
    daemon_wait_timeout: int | None = None,
    extra_args: Sequence[str] = (),
    check: bool = False,
    capture_output: bool = False,
    text: bool = True,
    env: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    args = _server_args(
        host=host,
        port=port,
        daemon=daemon,
        daemon_kill=daemon_kill,
        daemon_pid=daemon_pid,
        daemon_force=daemon_force,
        daemon_wait=daemon_wait,
        daemon_wait_timeout=daemon_wait_timeout,
        extra_args=extra_args,
    )
    return run(
        args,
        check=check,
        capture_output=capture_output,
        text=text,
        env=env,
        cwd=cwd,
    )


async def run_server_async(
    *,
    host: str | None = None,
    port: int | None = None,
    daemon: bool | None = None,
    daemon_kill: bool | None = None,
    daemon_pid: str | None = None,
    daemon_force: bool | None = None,
    daemon_wait: bool | None = None,
    daemon_wait_timeout: int | None = None,
    extra_args: Sequence[str] = (),
    check: bool = False,
    capture_output: bool = False,
    text: bool = True,
    env: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    args = _server_args(
        host=host,
        port=port,
        daemon=daemon,
        daemon_kill=daemon_kill,
        daemon_pid=daemon_pid,
        daemon_force=daemon_force,
        daemon_wait=daemon_wait,
        daemon_wait_timeout=daemon_wait_timeout,
        extra_args=extra_args,
    )
    return await run_async(
        args,
        check=check,
        capture_output=capture_output,
        text=text,
        env=env,
        cwd=cwd,
    )


def _server_args(
    *,
    host: str | None,
    port: int | None,
    daemon: bool | None,
    daemon_kill: bool | None,
    daemon_pid: str | None,
    daemon_force: bool | None,
    daemon_wait: bool | None,
    daemon_wait_timeout: int | None,
    extra_args: Sequence[str],
) -> list[str]:
    args = ["server"]

    _append_set_arg(args, "--host", host)
    _append_set_arg(args, "--port", port)
    _append_flag_arg(args, "--daemon", daemon)
    _append_flag_arg(args, "--daemon-kill", daemon_kill)
    _append_set_arg(args, "--daemon-pid", daemon_pid)
    _append_flag_arg(args, "--daemon-force", daemon_force)
    _append_flag_arg(args, "--daemon-wait", daemon_wait)
    _append_set_arg(args, "--daemon-wait-timeout", daemon_wait_timeout)

    args.extend(extra_args)
    return args


# endregion


# region MCP


def run_mcp(
    *,
    extra_args: Sequence[str] = (),
    check: bool = False,
    capture_output: bool = False,
    text: bool = True,
    env: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    args = _mcp_args(
        extra_args=extra_args,
    )
    return run(
        args,
        check=check,
        capture_output=capture_output,
        text=text,
        env=env,
        cwd=cwd,
    )


async def run_mcp_async(
    *,
    extra_args: Sequence[str] = (),
    check: bool = False,
    capture_output: bool = False,
    text: bool = True,
    env: Mapping[str, str] | None = None,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    args = _mcp_args(
        extra_args=extra_args,
    )
    return await run_async(
        args,
        check=check,
        capture_output=capture_output,
        text=text,
        env=env,
        cwd=cwd,
    )


def _mcp_args(
    *,
    extra_args: Sequence[str],
) -> list[str]:
    args = ["mcp"]

    # NOTE: Current MCP has no CLI arguments

    args.extend(extra_args)
    return args


# endregion


# region Internals


def _append_set_arg(args: list[str], flag: str, value: object | None) -> None:
    if value is None:
        return
    args.extend((flag, str(value)))


def _append_flag_arg(args: list[str], flag: str, value: bool | None) -> None:
    if value is None:
        return
    if value:
        args.append(flag)
    else:
        args.append(f"{flag}=false")


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
