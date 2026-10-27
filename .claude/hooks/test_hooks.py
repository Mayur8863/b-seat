#!/usr/bin/env python3
"""Self-test for the guard hooks. Run: python3 .claude/hooks/test_hooks.py"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).parent

# (hook, command, expected exit code) — 2 = blocked, 0 = allowed
CASES = [
    ("guard_bash.py", "git push origin main", 2),
    ("guard_bash.py", "git push -u origin feat/001-x", 0),
    ("guard_bash.py", "git push --force-with-lease origin feat/x", 0),
    ("guard_bash.py", "git push -f origin feat/x", 2),
    ("guard_bash.py", "gh pr merge 3 --squash", 2),
    ("guard_bash.py", "git commit --no-verify -m x", 2),
    ("guard_bash.py", "LEFTHOOK=0 git commit -m x", 2),
    ("guard_bash.py", "git reset --hard HEAD~1", 2),
    ("guard_bash.py", "docker compose down -v", 2),
    ("guard_bash.py", "cat .env", 2),
    ("guard_bash.py", "cat ./.env", 2),
    ("guard_bash.py", "head -n3 apps/api/.env.local", 2),
    ("guard_bash.py", "grep SECRET .env", 2),
    ("guard_bash.py", "source .env", 2),
    ("guard_bash.py", "cat .env.example", 0),
    ("guard_bash.py", "grep -n PORT .env.example", 0),
    ("guard_bash.py", "git commit -m 'docs: never read .env files'", None),  # depends on branch
    ("guard_bash.py", "bin/pnpm test", 0),
    ("readonly_bash.py", "git diff main...HEAD", 0),
    ("readonly_bash.py", "git diff main | grep -n TODO", 0),
    ("readonly_bash.py", "bin/pnpm --filter @bseat/api test", 0),
    ("readonly_bash.py", "rm -rf apps", 2),
    ("readonly_bash.py", "git log > out.txt", 2),
    ("readonly_bash.py", "bin/pnpm install", 2),
    ("readonly_bash.py", "git checkout main", 2),
    ("readonly_bash.py", "find . -name x -delete", 2),
    ("readonly_bash.py", "git diff && rm x", 2),
]


def run(hook: str, command: str) -> int:
    payload = json.dumps({"tool_input": {"command": command}})
    return subprocess.run(
        [sys.executable, str(HERE / hook)], input=payload, text=True, capture_output=True, check=False
    ).returncode


# usage_guard.py: (tool, command, used %, seconds until reset, expected exit, expect warning)
# A percentage of None means no usage file; a negative reset means the window already ended.
USAGE_CASES = [
    ("Agent", "", 95, 600, 2, False),
    ("Bash", "bin/pnpm check", 95, 600, 2, False),
    ("Bash", "docker compose --profile e2e run --rm e2e", 95, 600, 2, False),
    ("Bash", "bin/pnpm --filter @bseat/api test", 95, 600, 2, False),
    ("Bash", "git add -A && git commit -m x", 95, 600, 0, False),
    ("Bash", "bin/pnpm exec prettier --write x", 95, 600, 0, False),
    ("Read", "", 95, 600, 0, False),
    ("Agent", "", 85, 600, 0, True),
    ("Bash", "bin/pnpm check", 85, 600, 0, True),
    ("Agent", "", 50, 600, 0, False),
    ("Agent", "", 99, -5, 0, False),
    ("Agent", "", None, 0, 0, False),
]


def run_usage(tool: str, command: str, pct, reset_in: int) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as tmp:
        state = Path(tmp) / "usage.json"
        if pct is not None:
            now = time.time()
            window = {"used_percentage": pct, "resets_at": now + reset_in}
            state.write_text(json.dumps({"updated_at": now, "rate_limits": {"five_hour": window}}))
        env = {**os.environ, "BSEAT_USAGE_FILE": str(state)}
        env.pop("BSEAT_USAGE_GUARD", None)
        payload = json.dumps({"tool_name": tool, "tool_input": {"command": command}})
        return subprocess.run(
            [sys.executable, str(HERE / "usage_guard.py")],
            input=payload, text=True, capture_output=True, check=False, env=env,
        )


def main() -> int:
    failures = 0
    for hook, command, expected in CASES:
        code = run(hook, command)
        if expected is not None and code != expected:
            failures += 1
            print(f"FAIL {hook}: {command!r} -> {code}, expected {expected}")
    for tool, command, pct, reset_in, expected, warns in USAGE_CASES:
        result = run_usage(tool, command, pct, reset_in)
        warned = "additionalContext" in result.stdout
        if result.returncode != expected or warned != warns:
            failures += 1
            print(f"FAIL usage_guard.py: {tool} {command!r} at {pct}% -> "
                  f"{result.returncode} (warned={warned}), expected {expected} (warns={warns})")
    total = len(CASES) + len(USAGE_CASES)
    print(f"{total - failures}/{total} hook cases passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
