# ADR-0003: NestJS 12 + Drizzle + PostgreSQL for the API

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** project lead, architect agent

## Context

We need a typed REST API with an OpenAPI contract, relational data with strong integrity
(no double-booked seats), background jobs, and a stack that both humans and agents can
work on in one language.

## Decision

- **NestJS 12** (ESM, built with SWC) as the API framework, so the codebase is
  TypeScript end to end.
- **Zod 4 schemas as the single source of truth** for validation _and_ OpenAPI. NestJS 12
  validates Standard Schema natively (`@Body({ schema })`), and `@nestjs/swagger` 12
  converts Standard JSON Schema into OpenAPI components (`.meta({ id })` names them).
  `nestjs-zod` is **not** used (it doesn't support Nest 12).
- **Drizzle ORM + drizzle-kit** for a SQL-first schema with generated, reviewed SQL migrations.
- **PostgreSQL 18**. Invariants are database constraints, e.g. an exclusion constraint
  (`btree_gist`) to forbid overlapping bookings for one seat.
- **Redis 8 + BullMQ 6** for queues. BullMQ 6 requires an injected ioredis client under ESM;
  one shared client is provided by `RedisModule`.
- Errors use RFC 9457 problem details. Logs are pino JSON with request ids, and traces
  use OpenTelemetry.

## Alternatives considered

- **FastAPI + SQLAlchemy:** strong, but adds a second language and toolchain.
- **Prisma:** mature, but its generated client and schema DSL are heavier; Drizzle stays closer to SQL.
- **NestJS 11 + nestjs-zod:** known path, but already a previous major; native Standard Schema
  removes the extra dependency.

## Consequences

Contract changes flow Zod → `openapi.json` → generated client, and CI catches drift.
Teams must learn Drizzle's SQL-like API. NestJS 12 is new, so check docs (Context7 MCP)
rather than relying on memory.
