#!/usr/bin/env python3
"""PreToolUse guard: wind work down gracefully as the plan usage limit approaches.

Reads the usage that usage_statusline.py records. Above the warn threshold it tells the
agent to checkpoint (commit green work, update the task status line). Above the block
threshold it refuses new agent dispatches and long-running commands, so nothing new starts
that a session limit would cut off halfway. Everything else (git, edits, short commands)
stays allowed so work can always be committed. Fails open when no usage data exists.

Thresholds: BSEAT_USAGE_WARN (default 80) and BSEAT_USAGE_BLOCK (default 92), in percent of
the fuller of the 5-hour and 7-day windows. BSEAT_USAGE_GUARD=off disables the guard.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

STALE_AFTER_S = 30 * 60

# Commands that run for minutes; starting one near the limit risks losing the run.
LONG_RUNNING = re.compile(
    r"bin/pnpm\s+(check|test|test:coverage|build)\b"
    r"|bin/pnpm\s+--filter\s+\S+\s+(check|test|test:coverage|test:integration)\b"
    r"|bin/pnpm\s+check\s+--filter"
    r"|vitest\s+run\b"
    r"|--profile\s+e2e\b"
    r"|\bbin/security\b"
    r"|\bfor\s+\w+\s+in\b.*\bdo\b"  # loops of test runs
)

CHECKPOINT = (
    "Checkpoint now (AGENTS.md 'Working within usage limits'): commit work that is green, "
    "update your task's status line in tasks.md with 'done: … / next: …', and finish with "
    "the handoff block marked Interrupted if you cannot complete the task."
)


def state_file() -> Path:
    override = os.environ.get("BSEAT_USAGE_FILE")
    if override:
        return Path(override)
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    return Path(root) / ".claude" / "state" / "usage.json"


def current_usage(now: float):
    """(percent, resets_at) of the fullest live window, or None if unknown."""
    try:
        state = json.loads(state_file().read_text())
    except (OSError, ValueError):
        return None
    if now - float(state.get("updated_at", 0)) > STALE_AFTER_S:
        return None
    best = None
    for window in (state.get("rate_limits") or {}).values():
        if not isinstance(window, dict):
            continue
        pct, resets = window.get("used_percentage"), window.get("resets_at")
        if pct is None or (resets and resets <= now):
            continue
        if best is None or pct > best[0]:
            best = (float(pct), resets)
    return best


def threshold(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def main() -> int:
    if os.environ.get("BSEAT_USAGE_GUARD", "").lower() == "off":
        return 0
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    tool = payload.get("tool_name", "")
    command = (payload.get("tool_input") or {}).get("command", "")

    if tool in ("Agent", "Task"):
        heavy = True
    elif tool == "Bash":
        heavy = bool(LONG_RUNNING.search(command))
    else:
        return 0
    if not heavy:
        return 0

    usage = current_usage(time.time())
    if usage is None:
        return 0
    pct, resets = usage
    fmt = "%H:%M" if resets and resets - time.time() < 20 * 3600 else "%a %H:%M"
    when = time.strftime(fmt, time.localtime(resets)) if resets else "the next reset"
    what = "starting a new agent" if tool != "Bash" else "starting a long-running command"

    if pct >= threshold("BSEAT_USAGE_BLOCK", 92):
        print(
            f"Blocked by usage_guard.py: plan usage is at {pct:.0f}% (resets {when}). "
            f"Not {what}, so nothing is cut off halfway. {CHECKPOINT} "
            "Resume after the reset (coordinator: SendMessage the stopped agent).",
            file=sys.stderr,
        )
        return 2
    if pct >= threshold("BSEAT_USAGE_WARN", 80):
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "additionalContext": (
                    f"usage_guard: plan usage is at {pct:.0f}% (resets {when}). "
                    f"Allowed, but {CHECKPOINT}"
                ),
            }
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
