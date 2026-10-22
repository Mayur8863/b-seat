---
name: feature
description: Run a new feature through the BSeat agent workflow (spec → plan → approve → TDD implement → QA → review → docs → PR). Use when the user asks to build, add or change a feature.
argument-hint: 'Short description of the feature'
user-invocable: true
---

# /feature: the BSeat delivery workflow

Feature request: **$ARGUMENTS**

Follow the workflow in AGENTS.md exactly. You are the coordinator: delegate each
stage to the owning subagent and pass the previous stage's handoff along. Stop and ask
the human at every gate marked **HUMAN**.

1. **Spec** — Run `/speckit-specify` with the request (it creates `specs/NNN-<slug>/spec.md`
   and a feature branch). Resolve ambiguity with `/speckit-clarify`.
   **HUMAN:** confirm the spec, including acceptance criteria and non-goals.
2. **Plan** — Ask `task-manager` to produce `plan.md` and `tasks.md` (`/speckit-plan`,
   `/speckit-tasks`): tasks with acceptance criteria, owner agent, dependencies and status `todo`.
3. **Design gate** — Ask `architect` to review the plan, data model and API contract and
   write any ADRs. For UI work, ask `ui-ux-designer` for `specs/NNN-*/ui.md`.
   Re-plan until the architect marks the plan **Approved**. Run `/speckit-analyze`.
4. **Implement** — For each task in dependency order, on its own branch
   (`<type>/<NNN>-<slug>`), delegate to `backend-dev` or `frontend-dev`. Tests come first.
   They set the task to `review` and hand off with the template.
5. **Test** — Ask `qa-engineer` to verify the acceptance criteria and run the full suite.
   Failures go back to step 4. Only QA sets `done`.
6. **Review** — Run `code-reviewer` and `security-reviewer` on `git diff main...HEAD`
   (in parallel). Blockers and majors go back to step 4, then repeat step 5.
7. **Docs** — Ask `docs-writer` to update the docs and add the changeset.
8. **PR** — Commit with Conventional Commits. **HUMAN:** ask before `git push` and
   before opening the PR. The PR body is the final handoff summary plus the
   definition-of-done checklist. Never merge.

Keep `tasks.md` statuses current throughout, since it is the source of truth for progress.
