# ADR-0004: Better Auth hosted in the API, same-origin cookies

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** project lead, architect agent, security-reviewer agent

## Context

Users sign up with email and password (social login later). The API must authorize every
request. Running auth in two services (Next.js and NestJS) would split the source of truth
for sessions and invite CORS and cookie-domain problems.

## Decision

- **Better Auth** runs inside the NestJS API, mounted at `/api/auth/*` _before_ the JSON body
  parser. Sessions are stored in Postgres (Drizzle adapter, tables in `src/db/schema/auth.ts`).
  Telemetry is disabled.
- The browser only talks to the **web origin**. Locally, Next.js rewrites `/api/*` to the API.
  In AWS, the ALB routes `/api/*` to the API service and everything else to web, so
  cookies stay first-party and no CORS is needed.
- API routes use `AuthGuard` (`auth.api.getSession`) and `@CurrentSession()`. The web
  `proxy.ts` check is UX only.
- Minimum password length is 12. Email verification is required in production, and verification
  and reset emails go through the BullMQ mail queue. Rate limiting and secure cookies are on in production.

## Alternatives considered

- **Auth.js:** in maintenance mode, and awkward with a separate backend.
- **Keycloak:** right for enterprise SSO, but another stateful service to run. Revisit if SAML
  or LDAP is required (Better Auth also has an SSO plugin).

## Consequences

One auth source of truth and simple cookies. Better Auth's tables must follow its schema;
upgrades need a schema check (integration tests cover sign-up and session).
