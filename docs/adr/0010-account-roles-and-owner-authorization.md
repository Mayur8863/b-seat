# ADR-0010: Account roles and owner authorization

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** architect agent (002 T001); the requester for the product rules (one role at sign-up, never changed)

## Context

Feature 002 splits accounts into **owners** ("I own a space") and **renters** ("I need a space"):

- **FR-001:** the role is chosen at sign-up, before the account exists, and cannot be changed in this feature.
- **FR-003:** accounts created before the feature are renters.
- **FR-009 and FR-028:** owners see and change only their own spaces, seats, layouts, calendars, occupancy and
  bookings. Renters see only their own bookings. Anything else must behave as if it does not exist.
- **FR-005:** every feature needs a session.

Better Auth (ADR-0004) owns the `user` row and the sign-up route `/api/auth/sign-up/email`, which is mounted
before Nest, so Nest validation and `ProblemFilter` do not run there. Better Auth's first-party `admin` plugin
adds its own `user.role` field (`input: false`, default `"user"`) that is merged over application fields with the
same key.

The behaviour below was checked against the installed `better-auth@1.7.12` source (`db/schema.mjs`
`parseInputData`, `api/routes/sign-up.mjs`, `api/routes/update-user.mjs`, `db/with-hooks.mjs`) and the official
docs (better-auth.com, "Database": additional fields and database hooks), on 2026-10-27.

## Decision

### 1. Storage: a Better Auth additional field named `accountType` (AQ-5)

- **Name.** The product word stays "role", for example in "role-aware navigation" and `RolesGuard` /
  `@RequireRole('owner')`. The stored and wire field is `accountType` (`owner` | `renter`), and the column is
  `user.account_type`. Using the key `role` would collide with the `admin` plugin's field. If that plugin were
  added for platform staff later, it would override ours: sign-up would silently set `"user"` and fail the CHECK,
  and fixing it then would mean renaming a column on the auth table.
- **Database:** `account_type text NOT NULL DEFAULT 'renter'` with CHECK `user_account_type_valid` (`account_type
IN ('owner','renter')`). In PostgreSQL 11 and later, `ADD COLUMN … NOT NULL DEFAULT` with a constant only changes
  metadata, so every pre-existing row reads `renter` (FR-003) without a table rewrite. `text` with a CHECK, not an
  enum, because Better Auth's adapter writes plain strings.
- **Better Auth config** (`src/auth/auth.ts`):

  ```ts
  user: {
    additionalFields: {
      accountType: {
        type: ['owner', 'renter'],            // literal union in AuthSession['user']
        required: true,                       // create without it → 400 MISSING_FIELD
        input: true,                          // accepted at sign-up …
        validator: { input: z.enum(['owner', 'renter']) }, // … and validated: 400 VALIDATION_ERROR
        // no defaultValue: a JS default would satisfy `required` and skip the choice
      },
    },
  },
  databaseHooks: {
    user: {
      update: {
        before: async (data) => {
          if (data.accountType !== undefined) {
            throw new APIError('BAD_REQUEST', { message: 'accountType cannot be changed' });
          }
        },
      },
    },
  },
  ```

- **Verified behaviour of 1.7.12:**
  - On create, `parseInputData` throws `MISSING_FIELD` (400) for a required field with no `defaultValue`.
  - It runs `validator.input` synchronously (any Standard Schema, so Zod 4) and throws `VALIDATION_ERROR` (400) on
    issues. Sign-up runs inside `runWithTransaction`, so no `user` row is written.
  - `type` given as an array of literals is not validated by Better Auth itself, only by the validator.
  - Additional fields are `returned` by default, so `getSession` exposes `user.accountType` with no extra query.
  - `validator` is present in the 1.7.12 types and implementation, but the docs page does not describe it. T002's
    integration tests pin it, so an upgrade that drops it fails CI. The DB CHECK remains the backstop.

### 2. Immutability (FR-001)

- `input: true` also makes the field writable through `POST /api/auth/update-user`, which calls
  `parseUserInput(…, 'update')`. `input: false` is not an option, because sign-up must accept the field.
- The `databaseHooks.user.update.before` hook **throws** `APIError('BAD_REQUEST')` whenever an update carries
  `accountType`. It covers every update path (update-user and any plugin), not just one route. It must not
  `return false`. In 1.7.12 that aborts only the DB write: update-user still answers `{ status: true }` and builds
  the session user from the requested value, which would reach the session cookie if `session.cookieCache` were
  ever enabled. Returning `{ data }` cannot strip the key either, because 1.7.12 merges the returned data into the
  payload.
- No internal Better Auth update writes `accountType`, so email verification, name and password changes are
  unaffected.
- No DB trigger is added. Escalation from renter to owner only lets the user manage spaces they create
  themselves, which a second sign-up gives anyway. Ownership scoping (section 3) protects other users' data either
  way.

### 3. Authorization model

- **`AuthGuard`** on every 002 route (FR-005), unchanged.
- **`RolesGuard` + `@RequireRole('owner')`** on every `/api/owner/*` controller reads `session.user.accountType`.
  The wrong role gets **403** `urn:bseat:problem:http-403` (AQ-6). The same applies to renter-only routes
  (`PUT /api/me/preferences` for an owner). A 403 for the wrong role reveals nothing about any particular space.
- **Owner scoping with 404 parity:** every owner query puts `space.owner_id = caller` in the SQL `WHERE`, or joins
  through it, for spaces, seats, cubicles, pricing, calendars, occupancy marks, bookings and layouts. Another
  owner's resource and a random UUID give byte-identical 404 bodies, apart from `instance` and `requestId`
  (FR-009, AC 2.6). This lives in services, not controllers (AGENTS.md).
- **Renter catalogue (`/api/listings/*`)** reads `status = 'published'` only, so draft and unpublished spaces are 404. Booking a space that **was** published (`unpublished`) is 422 `booking-rule:space-not-published`, which
  names the rule (FR-020). A `draft` space is 404 there too, because it has never been listed.
- **Bookings:** renters read and cancel only `booking.user_id = caller`. Owners read bookings only through spaces
  they own. Both have 404 parity (FR-028).
- **Data minimisation:**
  - Renter responses never contain occupancy notes, other renters' identities or owner contact details.
  - The renter's name and email appear only in the owner bookings list (FR-027), and only the name in the owner
    email.
  - Logs carry ids only.
- **Owners as renters:** owners may use renter routes for other owners' spaces (Assumptions). Booking their own
  space is 422 `booking-rule:own-space`.

## Alternatives considered

- **Field key `role`** (the plan's proposal): reads naturally, but it collides with the `admin` plugin and would
  force a column rename on the auth table later.
- **A separate `account_role` table written after sign-up:** a crash between the two writes leaves an account
  with no role, and every session read needs a join.
- **The `admin` plugin's roles:** built for staff permissions and bans, with more surface than needed, and its
  `role` has `input: false`.
- **`input: false` plus a post-sign-up "choose your role" call:** the account would exist without a role, which
  contradicts FR-001 ("before I can create the account").
- **404 for the wrong role:** no security gain, and indistinguishable from a broken link for a confused user.
- **A trigger that blocks `account_type` updates:** real DB enforcement, but hidden logic for a low-impact
  escalation path. Revisit if account types ever gain privileges over other users' data.

## Consequences

- One source of truth for the role (the session), read without a query. Existing integration tests keep working
  through `signedInAgent(app, user, accountType = 'renter')`.
- Better Auth upgrades must re-run T002's sign-up and update-user tests. They pin `MISSING_FIELD`,
  `VALIDATION_ERROR` and the update refusal.
- Sign-up errors are Better Auth's `{ code, message }` bodies, not RFC 9457 problems (as for every
  `/api/auth/*` route since ADR-0004). The web maps `MISSING_FIELD` and `VALIDATION_ERROR` to field errors.
- A future social sign-in must collect `accountType` before the account is created (required field). That is out
  of scope now.
- The web types the client with `inferAdditionalFields({ user: { accountType: { type: ['owner', 'renter'],
required: true } } })` from `better-auth/client/plugins` (no new dependency).
