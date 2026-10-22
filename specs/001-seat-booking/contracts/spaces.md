# Contract: spaces

Module `apps/api/src/spaces/`. Controller `SpacesController` (`@ApiTags('spaces')`,
`@Controller('spaces')`, `@UseGuards(AuthGuard)`).

## GET /api/spaces

List every office space (FR-002, AC 1.1).

- **Handler**: `SpacesController.list`, operation id `Spaces_list`, hook `useSpacesList`
- **Auth**: signed in (any user). Not scoped, because spaces are shared reference data.
- **Request**: none
- **200** `SpaceList`

```ts
const SpaceSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    location: z.string(),
    timeZone: z.string().describe('IANA time zone, e.g. Europe/London'),
    seatCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'Space' });

const SpaceListSchema = z.object({ items: z.array(SpaceSchema) }).meta({ id: 'SpaceList' });
```

Ordered by `name` ascending.

- **401** `Problem`: no session

## GET /api/spaces/{spaceId}/availability

Every seat in the space, each with `free` or `taken` status for a local window
(FR-003, AC 1.2, AC 1.3). A window that breaks booking rules (for example, in the past) can still
be viewed (edge case). Only `endTime > startTime` is required.

- **Handler**: `SpacesController.availability`, operation id `Spaces_availability`, hook `useSpacesAvailability`
- **Auth**: signed in (any user). The response never identifies who holds a seat (FR-011).
- **Path**: `spaceId`, validated as `z.uuid()`
- **Query** `AvailabilityQueryInput`:

```ts
const AvailabilityQueryInput = z
  .object({
    date: LocalDate, // 'YYYY-MM-DD' in the space's time zone
    startTime: LocalTime, // 'HH:mm'
    endTime: LocalTime, // 'HH:mm'
  })
  .refine((q) => q.endTime > q.startTime, {
    path: ['endTime'],
    message: 'End time must be after start time',
  })
  .meta({ id: 'AvailabilityQueryInput' });
```

- **200** `SpaceAvailability`

```ts
const SeatAvailabilitySchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    features: z.array(z.string()),
    status: z.enum(['free', 'taken']),
  })
  .meta({ id: 'SeatAvailability' });

const SpaceAvailabilitySchema = z
  .object({
    space: z.object({ id: z.uuid(), name: z.string(), location: z.string(), timeZone: z.string() }),
    window: z.object({
      date: LocalDate,
      startTime: LocalTime,
      endTime: LocalTime,
      startsAt: Instant,
      endsAt: Instant,
    }),
    seats: z.array(SeatAvailabilitySchema), // ordered by label
  })
  .meta({ id: 'SpaceAvailability' });
```

`taken` means at least one **active** booking overlaps the half-open window `[startsAt, endsAt)`.
Cancelled bookings never make a seat taken.

- **400** `Problem` (`validation`): malformed id, date or time, or `endTime <= startTime`
- **401** `Problem`: no session
- **404** `Problem`: the space does not exist
- **422** `Problem` (`booking-rule:invalid-local-time`): window falls in a DST gap or overlap

### Examples

`GET /api/spaces/{londonId}/availability?date=2026-10-23&startTime=10:00&endTime=11:00`

```json
{
  "space": {
    "id": "…",
    "name": "London HQ",
    "location": "London, United Kingdom",
    "timeZone": "Europe/London"
  },
  "window": {
    "date": "2026-10-23",
    "startTime": "10:00",
    "endTime": "11:00",
    "startsAt": "2026-10-23T09:00:00.000Z",
    "endsAt": "2026-10-23T10:00:00.000Z"
  },
  "seats": [
    { "id": "…", "label": "A-01", "features": ["standing desk"], "status": "taken" },
    { "id": "…", "label": "A-02", "features": [], "status": "free" }
  ]
}
```
