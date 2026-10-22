#!/usr/bin/env python3
"""PreToolUse hook for reviewer agents (code-reviewer, security-reviewer).

Makes Bash read-only: only inspection commands and the repo's scanners are
allowed, and no writes, redirects or command chaining into other programs.
Exit 2 blocks the call and explains why.
"""

import json
import re
import shlex
import sys

ALLOWED = [
    r"git (diff|log|show|status|blame|branch|rev-parse|ls-files|merge-base)\b",
    r"(ls|cat|head|tail|wc|grep|rg|find|tree|file|stat)\b",
    r"bin/gitleaks (git|dir|detect)\b",
    r"bin/security\b",
    r"bin/pnpm (audit|why|ls|list|outdated|licenses)\b",
    r"bin/pnpm (lint|typecheck|test|test:coverage)\b",
    r"bin/pnpm --filter \S+ (lint|typecheck|test|test:coverage|test:unit)\b",
]

# Writes, substitution and chaining are refused outright; pipes are checked per segment.
FORBIDDEN = re.compile(r"(>|>>|\$\(|`|;|&&|\|\||\bsudo\b|\brm\b|\bmv\b|\bcp\b|\btee\b|\bsed\s+-i\b|-exec\b|-delete\b)")


def main() -> int:
    command = json.load(sys.stdin).get("tool_input", {}).get("command", "").strip()

    if FORBIDDEN.search(command):
        print("Read-only reviewer: writes, redirects and command chaining are not allowed.", file=sys.stderr)
        return 2

    for segment in (s.strip() for s in command.split("|")):
        try:
            shlex.split(segment)
        except ValueError:
            print("Read-only reviewer: could not parse command.", file=sys.stderr)
            return 2
        if not any(re.match(rule, segment) for rule in ALLOWED):
            print(
                f"Read-only reviewer: '{segment[:60]}' is not an allowed inspection command. "
                "Allowed: git diff/log/show/blame, ls/cat/grep/rg/find, bin/gitleaks, "
                "bin/security, bin/pnpm audit|lint|typecheck|test.",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
