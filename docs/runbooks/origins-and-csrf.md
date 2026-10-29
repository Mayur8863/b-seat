# Runbook: trusted origins and the cross-site write check

The API refuses unsafe requests that come from another site. This protects cookie sessions from
forged writes (cancel, publish, unpublish, mark occupied, book). Read this before you deploy, or when
writes fail with 403 while reads still work.

## What the check does

Code: `apps/api/src/common/csrf/csrf.guard.ts`, applied to every route as a global guard.

For a `POST`, `PUT`, `PATCH` or `DELETE` under `/api` (not `/api/auth/*`, which Better Auth checks itself):

- If `Sec-Fetch-Site` is present and is not `same-origin`, `same-site` or `none`, the request is refused.
- If `Origin` is present and is not in `TRUSTED_ORIGINS`, the request is refused.
- If neither header is present (curl, server-to-server, tests), the request passes. Such a client
  cannot carry a victim's cookie.

A refused request gets HTTP 403 with the message `Cross-site request refused`. Reads (`GET`) are never checked.

## Configure `TRUSTED_ORIGINS`

`TRUSTED_ORIGINS` is a comma-separated list of origins, validated in `apps/api/src/config/env.ts`.
It defaults to `http://localhost:3000`. Better Auth uses the same list.

- **Local:** the default is right. Compose sets it from `.env` (see [.env.example](../../.env.example)).
- **Deployed:** set it to the origin the browser sees for the web app, for example `https://<web-host>`.
  The browser calls `/api/*` on the web origin, and Next.js proxies it to the API, so the `Origin` header
  is the web origin, not the API's. If the web origin is missing from the list, every unsafe request from
  the app gets 403, while sign-in and reads may still work.

Origins are exact matches: scheme, host and port all count, and `*` is not a wildcard. Add an origin only
when a browser on that origin must call the API.

## Symptoms and checks

| Symptom                                                          | Likely cause                                 |
| ---------------------------------------------------------------- | -------------------------------------------- |
| Book, cancel, publish, unpublish or mark occupied fails with 403 | Web origin missing from `TRUSTED_ORIGINS`    |
| Same actions work locally but fail after a deploy                | `TRUSTED_ORIGINS` still at the local default |
| Only a request from a script or another site fails               | Expected: the check is doing its job         |

To confirm, open the browser's network tab, select the failing request and compare its `Origin` header
with the value of `TRUSTED_ORIGINS` in the API's environment. The check does not log refusals, so the
network tab is the place to look. Do not paste the cookie or session values into tickets.

## Known limits

- There are no CSRF tokens. The origin check is the only protection for cookie-authenticated writes.
  Token-based hardening is an optional follow-up; see the
  [known limitations in the README](../../README.md#known-limitations).
- A request with neither `Origin` nor `Sec-Fetch-Site` passes. Browsers send one of them on cross-site
  writes, so the gap only matters for non-browser clients, which cannot carry a victim's cookie.
