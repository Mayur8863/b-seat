#!/usr/bin/env python3
"""PreToolUse guard for every Bash call (all agents).

Enforces AGENTS.md workflow rules that permissions alone can't express:
no committing/pushing to main, no merging PRs, no bypassing git hooks, no
destructive resets, no reading .env files. Exit 2 blocks the call and the
message is shown to the agent.
"""

import json
import re
import subprocess
import sys

PROTECTED = {"main", "master"}

# A reading command (or `source`/`.`) whose arguments include a .env file other than .env.example.
ENV_READ = (
    r"(^|[;&|(]\s*|\s)(cat|less|more|head|tail|grep|rg|awk|sed|bat|xxd|od|strings|cp|scp|base64|source|\.)"
    r"(?=\s)[^;&|]*?[\s'\"/=]\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'\";&|)])"
)

RULES = [
    (r"\bgh\s+pr\s+merge\b", "Agents never merge PRs. A human approves and merges every PR."),
    (r"\bgit\s+push\b[^|;&]*\s(--force|-f)\b(?!-with-lease)", "Force-push is not allowed."),
    (r"\bgit\s+push\b[^|;&]*\b(origin\s+)?(HEAD:)?(main|master)\b", "Never push to main. Push your feature branch and open a PR."),
    (r"--no-verify\b|\bLEFTHOOK=0\b", "Git hooks may not be bypassed (AGENTS.md: Do / Don't)."),
    (r"\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-z]*f", "Destructive git commands need a human. Ask first."),
    (r"\bdocker\s+(compose\s+down\s+[^|;&]*-v\b|volume\s+(rm|prune)\b|system\s+prune\b)", "Deleting Docker volumes destroys local data. Ask a human first."),
    (ENV_READ, "Never read or print .env files. Use .env.example for variable names."),
]


def current_branch() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5, check=False,
        ).stdout.strip()
    except Exception:  # noqa: BLE001 - never crash the hook
        return ""


def main() -> int:
    payload = json.load(sys.stdin)
    command = payload.get("tool_input", {}).get("command", "")

    for pattern, reason in RULES:
        if re.search(pattern, command):
            print(f"Blocked by .claude/hooks/guard_bash.py: {reason}", file=sys.stderr)
            return 2

    if re.search(r"\bgit\s+commit\b", command) and current_branch() in PROTECTED:
        print(
            "Blocked: you are on main. Create a task branch first: "
            "git switch -c <type>/<spec-id>-<slug>",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
