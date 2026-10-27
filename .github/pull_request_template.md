## Handoff: <task id> <title>

**Spec / task:** `specs/NNN-<feature>/tasks.md` → T###
**Done:**
-

**Files changed:** (summary; the diff has the details)

**How to verify:**

```bash
bin/pnpm check
docker compose --profile e2e run --rm e2e   # if UI changed
```

**Open questions / risks:**

## Definition of done

- [ ] Acceptance criteria met and covered by tests (tests written first for logic)
- [ ] Changed-line coverage ≥ 80% (CI)
- [ ] `openapi.json` and the generated client are current (`bin/pnpm gen:api`)
- [ ] Migration generated and reviewed (if schema changed)
- [ ] qa-engineer: all criteria pass, task marked `done`
- [ ] code-reviewer: APPROVE · security-reviewer: APPROVE (no blocker or major left)
- [ ] Docs / ADR / `.env.example` / changeset updated where relevant
- [ ] UI: loading, empty, error and success states; axe clean; keyboard usable

> Agents never merge. A human reviews and merges this PR.
