# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** project lead, architect agent

## Context

Humans and AI agents both change this codebase. Agents lack the history of hallway
conversations, so decisions that are not written down get re-litigated or silently undone.

## Decision

We keep Architecture Decision Records in `docs/adr/` using a lightweight MADR format
(`template.md`). Each file is numbered `NNNN-kebab-title.md` and is never deleted; an ADR
is replaced by a new one marked "Superseded by". The architect agent owns ADRs, and any
significant or hard-to-reverse decision (new framework, datastore, auth change, public
contract change, infrastructure) needs one in the same PR. `docs/adr/README.md` is the index.

## Consequences

Agents read the relevant ADRs before changing an area. Reviews can point to a written
rationale. The cost is a few minutes per decision.
