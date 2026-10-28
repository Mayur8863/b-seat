# Contract: accounts, preferences and reference data

## Sign-up with a role (Better Auth, T002)

`POST /api/auth/sign-up/email` is Better Auth's route (not in `openapi.json`). Its body gains a required
`accountType`. "Role" is the product word, and `accountType` is the field name (`role` is reserved by Better
Auth's `admin` plugin; [ADR-0010](../../../docs/adr/0010-account-roles-and-owner-authorization.md)):

```json
{
  "name": "Asha",
  "email": "asha@example.com",
  "password": "correct-horse-battery",
  "accountType": "owner"
}
```

- `accountType` missing → **400** `{ code: "MISSING_FIELD", message: "accountType is required" }`. A value
  other than `owner` | `renter` → **400** `{ code: "VALIDATION_ERROR", … }`. In both cases no `user` row is
  created (FR-001, AC 1.1). These are Better Auth's error bodies, not RFC 9457 problems (verified against
  `better-auth@1.7.12`, ADR-0010).
- `POST /api/auth/update-user` with `accountType` (alone or with other fields) → **400** from the
  `databaseHooks.user.update.before` guard. Nothing is updated, and the stored value is unchanged (FR-001,
  "cannot be changed"). Updates without `accountType` (name, image) work as before.
- Web: `authClient.signUp.email({ ..., accountType })`, typed with `inferAdditionalFields` (research R-1). The
  form maps `MISSING_FIELD` / `VALIDATION_ERROR` to the role field's error.

## GET /api/me (changed, T002 and T013)

`MeController.get`, hook `useMeGet`. `Me` gains two fields (additive):

```ts
const MeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    accountType: z.enum(['owner', 'renter']), // T002
    preferences: z
      .object({
        // T013
        country: CountryCode.nullable(),
        city: z.string().nullable(),
        area: z.string().nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'Me' });
```

Accounts created before this feature return `accountType: "renter"` (FR-003, AC 1.6).

## PUT /api/me/preferences (T013)

`MeController.updatePreferences`, hook `useMeUpdatePreferences`. Renters only (owners → 403).

```ts
const UpdatePreferencesInput = z.strictObject({
  country: CountryCode.nullable(),
  city: z.string().trim().min(1).max(100).nullable(),
  area: z.string().trim().min(1).max(100).nullable(),
}).meta({ id: 'UpdatePreferencesInput' });
const Preferences = z.object({ country: ..., city: ..., area: ... }).meta({ id: 'Preferences' });
```

Upserts `renter_preference`. **200** `Preferences` · **400** · **401** · **403** (owner). All three null clears
them (FR-002, AC 1.2).

## GET /api/reference (T019)

`ReferenceController.get`, hook `useReferenceGet`. Any signed-in user. Cacheable (`Cache-Control: private, max-age=3600`).

```ts
const Reference = z
  .object({
    countries: z.array(
      z.object({ code: CountryCode, name: z.string(), timeZones: z.array(TimeZone) }),
    ), // sorted by name
    currencies: z.array(z.object({ code: CurrencyCode, name: z.string() })),
    utilities: z.array(StandardUtility),
  })
  .meta({ id: 'Reference' });
```

`timeZones` are suggestions ("suggested from the country", AC 2.1). The first entry is the default. The owner
may choose any **offered** zone: the union of every country's `timeZones` plus `UTC`, which is exactly what
`OfferedTimeZone` accepts on `POST`/`PATCH /api/owner/spaces` (OQ-B, decided in T018). The web builds its "All time
zones" list from this payload, never from `Intl.supportedValuesOf('timeZone')`.
