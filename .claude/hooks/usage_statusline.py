#!/usr/bin/env python3
"""Status line for Claude Code that also records plan usage for usage_guard.py.

Claude Code passes session JSON on stdin; `rate_limits` (Pro/Max plans only) holds the
5-hour and 7-day windows. Hooks never see that data, so this script writes it to
.claude/state/usage.json and usage_guard.py reads it before agent dispatches and long runs.
"""

import json
import os
import sys
import time
from pathlib import Path


def state_file() -> Path:
    override = os.environ.get("BSEAT_USAGE_FILE")
    if override:
        return Path(override)
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    return Path(root) / ".claude" / "state" / "usage.json"


def write_state(rate_limits: dict) -> None:
    path = state_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"updated_at": time.time(), "rate_limits": rate_limits}))
    tmp.replace(path)  # atomic, so the guard never reads a half-written file


def window_label(name: str, window: dict) -> str:
    pct = window.get("used_percentage")
    if pct is None:
        return ""
    label = f"{name} {pct:.0f}%"
    resets = window.get("resets_at")
    if resets:
        fmt = "%H:%M" if resets - time.time() < 20 * 3600 else "%a %H:%M"
        label += f" (resets {time.strftime(fmt, time.localtime(resets))})"
    return label


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:  # noqa: BLE001 - a status line must never crash
        payload = {}

    rate_limits = payload.get("rate_limits") or {}
    if rate_limits:
        try:
            write_state(rate_limits)
        except OSError:
            pass

    parts = [payload.get("model", {}).get("display_name", "")]
    parts += [window_label("5h", rate_limits.get("five_hour") or {}),
              window_label("7d", rate_limits.get("seven_day") or {})]
    print(" · ".join(p for p in parts if p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
