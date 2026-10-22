#!/usr/bin/env python3
"""Self-test for the Bash guard hooks. Run: python3 .claude/hooks/test_hooks.py"""

import json
import subprocess
import sys
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


def main() -> int:
    failures = 0
    for hook, command, expected in CASES:
        code = run(hook, command)
        if expected is not None and code != expected:
            failures += 1
            print(f"FAIL {hook}: {command!r} -> {code}, expected {expected}")
    print(f"{len(CASES) - failures}/{len(CASES)} hook cases passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
