# UI spec: Seat booking (001)

**Task**: T006 · **Owner**: ui-ux-designer · **Used by**: T008, T011, T013 (frontend-dev), T014, T015 (qa-engineer)
**Tokens**: [docs/design/tokens.md](../../docs/design/tokens.md). Semantic tokens only; contrast values come from there.

## 1. Screens, routes and shell

| Route               | `<h1>` / metadata title     | Purpose                                  | Hooks                                                         |
| ------------------- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `/dashboard` (edit) | existing `Welcome` h1       | Entry points to the two pages            | none new                                                      |
| `/book`             | Book a seat / `Book a seat` | Choose space and window, see seats, book | `useSpacesList`, `useSpacesAvailability`, `useBookingsCreate` |
| `/bookings`         | My bookings / `My bookings` | Upcoming bookings, cancel                | `useBookingsListMine`, `useBookingsCancel`                    |

- **Shell** (both new pages, same as the dashboard): `<main id="main" className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 sm:py-12">`.
  Top: a `Dashboard` link (`Button variant="link" size="sm" asChild`, `ArrowLeftIcon` aria-hidden). Then a
  row (`flex flex-wrap items-center justify-between gap-3`) with the h1 (`text-2xl font-semibold tracking-tight`)
  and a cross-link `Button variant="outline" asChild`: on `/book` "My bookings", on `/bookings` "Book a seat".
  Section headings are h2 `text-lg font-medium`.
- **Dashboard**: replace the placeholder `<p>` with `<nav aria-label="Bookings">` holding
  `Button asChild` → `/book` "Book a seat" and `Button variant="outline" asChild` → `/bookings` "My bookings".
  Mobile: `grid gap-3` (full-width buttons); `sm:flex`. The Welcome/Sign out row gets `flex-wrap`.

## 2. Components

Existing `@bseat/ui`: Alert, Badge, Button, Card, Input, Label, Skeleton, Toaster (sonner).
Add to `packages/ui` with the shadcn CLI (they use the existing `radix-ui` dependency only):

| Component       | Used for                      | Note                                                                                                                                          |
| --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `radio-group`   | Space choice cards, seat grid | Radix roving focus gives the keyboard model in §4                                                                                             |
| `alert-dialog`  | Cancel confirmation           | Radix focuses the Cancel ("Keep booking") button on open                                                                                      |
| `native-select` | Start and end time            | If the CLI has none: add `native-select.tsx`, a `<select>` with Input's classes + `appearance-none pr-8` and an aria-hidden `ChevronDownIcon` |

Icons are lucide (`CircleCheckIcon`, `BanIcon`, `InfoIcon`, `Loader2Icon`, `ArrowLeftIcon`), always `aria-hidden` next to text.

### State matrix

| Component                 | Default                                                                                     | Hover                  | Focus (visible)                                | Disabled                     | Loading                                     | Empty                    | Error                             | Success                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------- | ---------------------------- | ------------------------------------------- | ------------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| Space card (radio)        | `rounded-lg border bg-card p-3`, empty radio circle                                         | `bg-muted/50`          | tile `outline-2 outline-offset-2 outline-ring` | n/a                          | 2 × `Skeleton h-18 rounded-lg`              | §3.2 copy, no form       | Alert + Try again (§3.2)          | Selected: `border-primary ring-1 ring-primary bg-primary/5`, filled dot |
| Date / time fields        | `Input` / `NativeSelect`, Label above                                                       | browser default        | `border-ring` + halo (shadcn)                  | not used                     | n/a                                         | n/a                      | `aria-invalid`, text below (§3.3) | n/a                                                                     |
| Show seats button         | `Button` default                                                                            | `bg-primary/80`        | shadcn ring (tokens F1)                        | while pending only           | `aria-busy`, spinner + "Loading seats…"     | n/a                      | n/a                               | n/a                                                                     |
| Seat tile, free           | `rounded-lg border bg-card p-3 min-h-16`, circle, `CircleCheckIcon` + "Free" `text-success` | `bg-muted/50`          | tile outline as space card                     | grid disabled while booking  | 6 × `Skeleton h-16 rounded-lg`              | §3.4                     | n/a                               | Selected: as space card + filled dot                                    |
| Seat tile, taken          | `bg-muted border-dashed`, `BanIcon` + "Taken" `text-muted-foreground`, no opacity on text   | none                   | not focusable (Radix skips disabled)           | always (`disabled`)          | as free                                     | n/a                      | n/a                               | n/a                                                                     |
| Booking bar + Book button | hint "Select a free seat to book it." + `Book seat` disabled                                | `bg-primary/80`        | shadcn ring                                    | no seat selected, or pending | `aria-busy`, spinner + "Booking…"           | hidden when 0 free seats | Alert in bar (§3.5)               | Success panel (§3.5)                                                    |
| Booking card              | `Card size="sm"`, h2, time, location                                                        | none (not interactive) | h2 `tabIndex={-1}` for programmatic focus only | n/a                          | 2 × `Skeleton h-24 rounded-xl`              | §5.1 empty card          | page Alert (§5.3)                 | "In progress" Badge when started                                        |
| Cancel button + dialog    | `Button variant="outline" size="sm"` "Cancel booking"                                       | `bg-muted`             | shadcn ring                                    | hidden for started bookings  | in dialog: action `aria-busy` "Cancelling…" | n/a                      | §5.3                              | toast + focus move (§5.3)                                               |
| Dashboard links           | Button default / outline                                                                    | per variant            | shadcn ring                                    | n/a                          | n/a                                         | n/a                      | n/a                               | n/a                                                                     |

## 3. `/book`

### 3.1 Order (DOM order = tab order)

1. Shell (Dashboard link, h1, "My bookings").
2. `<form noValidate>` (RHF + `zodResolver`): fieldset "Office space" (`<legend><h2>`), fieldset "When"
   (`<legend><h2>`), submit "Show seats". The form renders after spaces load.
3. Seats area, **outside** the form. Always rendered: a visible `<p role="status" className="text-sm">` (empty
   until the first valid submit, so its first update is announced). After that submit, a
   `<section aria-labelledby="seats-heading">` around it adds h2 "Seats", window line, stale note, seat grid and booking bar
   (status line sits under the window line).

### 3.2 Layout per breakpoint (mobile first; Tailwind `sm` 640, `md` 768, `lg` 1024)

| Region      | < 640 (mobile)                                                                                 | 640–1023 (tablet)                                           | ≥ 1024 (desktop)                                                  |
| ----------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Space cards | 1 column                                                                                       | `sm:grid-cols-2`                                            | 2 columns                                                         |
| When fields | Date full width; Start + End `grid-cols-2`; submit full width                                  | Date, Start, End `sm:grid-cols-3`; submit below, auto width | `lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end`, submit in the row |
| Seat grid   | `grid-cols-2 gap-2`                                                                            | `sm:grid-cols-3 md:grid-cols-4`                             | `lg:grid-cols-6`                                                  |
| Booking bar | `sticky bottom-0`, full bleed (`-mx-4 px-4`), `border-t bg-background py-3`, button full width | `sm:mx-0 sm:rounded-lg sm:border`, text left, button right  | as tablet                                                         |

Seat tiles get `scroll-mb-28` so a focused tile is never hidden behind the sticky bar. Use a solid
`bg-background` for the bar (no translucency, so text contrast stays as in tokens.md).

**Space list states.** Loading: skeletons inside the fieldset, fieldset `aria-busy="true"`, sr-only
polite text "Loading office spaces…". Empty (`items: []`): "There are no office spaces to book yet." (muted, no form).
Error: `Alert variant="destructive"` title "We couldn't load office spaces", description per §6, and
`Button variant="outline" size="sm"` "Try again" (refetch). Exactly one space: preselect it.
Card content: name (`font-medium`), location (`text-muted-foreground`), "{timeZone} · {n} seats"
(`text-xs text-muted-foreground`; "1 seat" for one). The `RadioGroupItem` has `aria-labelledby={nameId}` and
`aria-describedby="{locationId} {metaId}"`; the whole card is a `<Label htmlFor={itemId}>` click target.

### 3.3 Window picker

| Field      | Label        | Control             | Options / default                                                          |
| ---------- | ------------ | ------------------- | -------------------------------------------------------------------------- |
| Date       | "Date"       | `Input type="date"` | default tomorrow (browser's calendar date as `YYYY-MM-DD`); no `min`/`max` |
| Start time | "Start time" | `NativeSelect`      | `07:00`…`19:45` every 15 min (52 options); default `09:00`                 |
| End time   | "End time"   | `NativeSelect`      | `07:15`…`20:00` every 15 min (52 options); default `17:00`                 |

- Help text under the "When" legend, referenced by `aria-describedby` on all three fields:
  "Times are local to {space.name} ({space.timeZone})." Before a space is chosen: "Times are local to the office you choose."
- 24-hour `HH:mm` labels equal the values. The options already keep to quarter hours and working hours. The web app does
  no time-zone or "now" checks; the server validates the rest and §6 gives the copy.
- Client validation on submit (zod). Error text `text-destructive text-sm` below the field, its id appended to
  `aria-describedby`, `aria-invalid` set; RHF focuses the first invalid field; no request is sent.
  Space: "Choose an office space" (below the legend; radiogroup gets `aria-invalid` and `aria-describedby`).
  Date: "Choose a date". Start: "Choose a start time". End: "Choose an end time". End ≤ start (on End):
  "End time must be after start time".
- Submit "Show seats". Pending: disabled, `aria-busy="true"`, `Loader2Icon` + "Loading seats…".
  On success: scroll the "Seats" heading into view (`block: 'start'`, no smooth scrolling); focus stays on the button.

### 3.4 Seats section

- Window line (`text-muted-foreground`), built from the **response** (`space`, `window`), never from form values:
  "{space.name} · {when}" (formats in §7).
- Status region text: loading "Loading seats…", then "{free} of {total} seats free." Section `aria-busy` while loading.
- Stale note: when the form values differ from the shown response, show (`InfoIcon` + muted text, not live)
  "You changed the details. Select Show seats to update the seats." Booking still uses the shown window.
- Empty (0 seats): "This space has no seats yet." No grid, no bar.
- All taken: status "0 of {total} seats free.", grid shown, bar replaced by muted text "Try a different time or another space."
- Error: `Alert variant="destructive"` (role alert) in place of the grid; copy per §6 with action `availability`. Focus does not move.

### 3.5 Booking bar

- No selection: muted hint (id) "Select a free seat to book it." + `Button size="lg"` "Book seat", disabled, `aria-describedby` hint.
- Selected: "{seat} · {space.name}" (`font-medium`), "{when}" (muted), `Button size="lg"` **"Book {seat}"**.
- Pending: button disabled, `aria-busy="true"`, spinner + "Booking…"; the seat RadioGroup is `disabled`. One request at most.
- Error: `Alert variant="destructive"` above the button, title and description per §6 (action `book`),
  `tabIndex={-1}`, **receives focus**. It clears on the next selection or submit. On `seat-unavailable` or 404, invalidate
  availability and clear the selection.
- Success: the bar content becomes a panel: `Alert` (default variant, `role="group"`, `aria-labelledby` its title),
  `CircleCheckIcon text-success`, title (`tabIndex={-1}`, **receives focus**) "Seat {seat} booked", description
  "{space.name} · {when}. A confirmation email is on its way." and link "View my bookings" (`/bookings`,
  `text-primary underline underline-offset-4`). It stays until the user selects a seat or submits the form again.
  Invalidate availability and my-bookings; the seat then shows "Taken" (own bookings show as taken in this slice, plan Q3).
  No toast here: focus already announces it, and the link must not time out (WCAG 2.2.1).

### 3.6 Interaction budget (SC-001)

Counted after a window is chosen (space, date, start, end set): **1** "Show seats" → **2** select a free seat →
**3** "Book {seat}" → success panel. 3 ≤ 4. There is no booking confirmation dialog: the bar shows exactly what
will be booked, and a booking can be cancelled. Tests: three `user.click` calls (keyboard: Tab moves are navigation, not interactions).

## 4. Seat grid accessibility

- **Pattern**: WAI-ARIA radio group (Radix `RadioGroup`, `loop`), `aria-labelledby="seats-heading"`,
  `aria-describedby` = status id. One tab stop for the whole grid.
- **Seat**: `RadioGroupItem value={seat.id} id=…` with `aria-labelledby="{labelId} {statusId}"` (name: "A-03 Free") and
  `aria-describedby={featuresId}` when it has features ("standing desk, dual monitor", shown as `Badge variant="outline"`
  in a `flex flex-wrap gap-1`). The tile is a `<Label htmlFor>` so the whole tile is the click target (≥ 44 × 44 px).
  Taken seats: `disabled` on the item (exposed as unavailable, skipped by arrow keys, still read in browse mode).
- **Keyboard**: Tab enters on the selected seat, or the first free seat. Arrow Right/Down = next free seat,
  Left/Up = previous, in label (reading) order, not by visual row; selection follows focus. Home/End = first/last free seat.
  Space selects. Tab leaves to the Book button.
- **Without colour**: free = `CircleCheckIcon` + "Free"; taken = `BanIcon` + "Taken" + dashed border + muted fill;
  selected = filled radio dot + primary border (2 px look via `ring-1`); focus = solid 2 px outline with offset, separate from the selected ring.
- **Contrast** (tokens.md): "Free" `success` on card 5.65 / 7.67; on selected `primary/5` 5.23 / 6.57; "Taken"
  `muted-foreground` on `muted` 5.50 / 6.09; outline and selected border 7.69 / 7.13 (light / dark). Taken tiles get no opacity.

## 5. `/bookings`

Order: shell; page-level Alert slot (cancel errors); `<ul aria-label="Upcoming bookings" className="grid gap-3">`
in API order (soonest first), one `<li>` per booking.

### 5.1 Booking card and list states

- Content: h2 (`tabIndex={-1}`, `text-base font-medium`) "Seat {seat.label} · {space.name}"; line
  `<time dateTime={startsAt}>{date}, {startTime}</time>–<time dateTime={endsAt}>{endTime}</time> ({timeZone})`;
  muted line `{space.location}`.
- Started (`startsAt ≤ now < endsAt`, compare instants; no time-zone math): `Badge variant="secondary"` "In progress"
  after the title, no Cancel button, muted text "Started bookings can't be cancelled."
- Cancel trigger: visible "Cancel booking" + `<span className="sr-only"> for seat {seat} on {date}, {startTime}</span>`
  (unique name that contains the visible label). Mobile: full width below the text; `sm+`: `CardAction` top right.
- Loading: list container `aria-busy="true"`, sr-only polite "Loading your bookings…", 2 skeletons.
- Empty: Card, centred: h2 (`tabIndex={-1}`) "No upcoming bookings", muted "When you book a seat, it shows up here.",
  `Button asChild` → `/book` "Book a seat".
- Error: `Alert variant="destructive"` title "We couldn't load your bookings", description per §6, "Try again" (refetch).

### 5.2 Layout

Single column at every breakpoint (`max-w-4xl` shell); cards stack with `gap-3`. Mobile: the action sits under the text.
`sm+`: title and action share the header row.

### 5.3 Cancel flow

1. "Cancel booking" opens `AlertDialog`. Title "Cancel this booking?" Description "Seat {seat} at {space.name},
   {when}. The seat becomes free for others." Buttons: `AlertDialogCancel` "Keep booking" (initial focus) and
   `AlertDialogAction` "Cancel booking" (`buttonVariants({ variant: 'destructive' })`). Esc or "Keep booking" closes; focus returns to the trigger.
2. Pending: the action's `onClick` calls `preventDefault()` so the dialog stays open; action disabled, `aria-busy`,
   "Cancelling…"; "Keep booking" disabled; Esc ignored (`onEscapeKeyDown` prevented).
3. Success: close; remove the booking from the cached list, then invalidate my-bookings and availability.
   `toast.success('Booking cancelled', { description: 'Seat {seat} at {space.name} is free again.' })` (sonner's polite region).
   Focus (`onCloseAutoFocus` → `preventDefault()`): the next card's h2, else the previous card's h2, else the empty-state h2.
4. Error: close; show the page-level `Alert variant="destructive"` (role alert) with §6 copy (action `cancel`); focus returns to
   the trigger, or to the alert (`tabIndex={-1}`) if the trigger is gone. On `already-started` or 404, invalidate the list.
   The alert clears on the next cancel attempt.

## 6. Problem copy (`apps/web/src/lib/booking-problems.ts`)

Map `problem.type` (prefix `urn:bseat:problem:`) and the action (`availability` | `book` | `cancel`) to a title and
description. `{seat}` = selected seat label, `{timeZone}` = the space's IANA id (both known on the client).

| `type`                               | Action             | Title                                 | Description                                                                                                                       |
| ------------------------------------ | ------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `booking:seat-unavailable`           | book               | Seat no longer available              | Someone else booked {seat} for an overlapping time. Choose another seat.                                                          |
| `booking:user-overlap`               | book               | You already have a booking then       | You can hold one booking at a time. Choose a time that doesn't overlap, or cancel your other booking in [My bookings](/bookings). |
| `booking:already-started`            | cancel             | This booking has already started      | Bookings can only be cancelled before they start.                                                                                 |
| `booking-rule:end-before-start`      | book               | End time is before start time         | Choose an end time after the start time.                                                                                          |
| `booking-rule:not-on-quarter-hour`   | book               | Use 15-minute steps                   | Start and end times must be on :00, :15, :30 or :45.                                                                              |
| `booking-rule:invalid-local-time`    | availability, book | That time doesn't exist in {timeZone} | A daylight-saving change skips or repeats this time in {timeZone}. Choose a different start or end time.                          |
| `booking-rule:too-short`             | book               | Booking too short                     | A booking must be at least 15 minutes long.                                                                                       |
| `booking-rule:too-long`              | book               | Booking too long                      | A booking can be at most 10 hours long. Choose a shorter time.                                                                    |
| `booking-rule:outside-working-hours` | book               | Outside working hours                 | Bookings must be between 07:00 and 20:00 local time ({timeZone}).                                                                 |
| `booking-rule:starts-in-past`        | book               | That time has passed                  | Choose a start time in the future.                                                                                                |
| `booking-rule:too-far-ahead`         | book               | Too far ahead                         | You can book up to 30 days ahead. Choose an earlier date.                                                                         |
| `http-404`                           | availability       | Office space not found                | This space is no longer available. Choose another space. (refetch spaces)                                                         |
| `http-404`                           | book               | Seat not found                        | This seat is no longer available. Choose another seat.                                                                            |
| `http-404`                           | cancel             | Booking not found                     | This booking no longer exists. Your list has been updated.                                                                        |
| `validation` (400)                   | any                | Check the details                     | Some details weren't valid. Check the date and times and try again.                                                               |
| `http-401`                           | any                | Your session has ended                | [Sign in](/sign-in?next={current path}) again to continue.                                                                        |
| other 4xx type with `detail`         | any                | Something went wrong                  | {detail}                                                                                                                          |
| 5xx, or no `detail`                  | any                | Something went wrong                  | We couldn't complete that. Try again in a moment.                                                                                 |
| no response (network)                | any                | We couldn't reach BSeat               | Check your connection and try again.                                                                                              |

List loads (spaces, bookings, availability without a specific type above) keep their own titles
("We couldn't load office spaces" / "We couldn't load seats" / "We couldn't load your bookings") with the description from this table.

## 7. Formatting

- Times: the API's local `startTime`/`endTime` verbatim, 24-hour (`09:00`); ranges use an en dash without spaces (`09:00–17:00`).
- Date: from the local `date` string, via `formatToParts` of
  `new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })`
  applied to ``new Date(`${date}T00:00:00Z`)``, joined as "Fri 23 Oct 2026" (weekday, day, month, year parts
  joined by spaces, so CLDR punctuation changes don't break tests).
- `{when}` = "Fri 23 Oct 2026, 09:00–17:00 (Europe/London)". Every displayed time carries the space's IANA zone; never convert to the browser's zone.
- Text uses the `en` voice of the existing app: short, sentence case, "you", no exclamation marks.

## 8. Announcements and focus (summary)

| Event                     | Mechanism                           | Announced text                                           | Focus after                              |
| ------------------------- | ----------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| Spaces / bookings loading | `aria-busy` + sr-only polite text   | Loading office spaces… / Loading your bookings…          | unchanged                                |
| Form invalid              | inline errors                       | (field errors via `aria-describedby`)                    | first invalid field (RHF)                |
| Seats loading / loaded    | always-present `role="status"`      | Loading seats… → "5 of 6 seats free."                    | stays on Show seats                      |
| Availability error        | `Alert` role alert                  | §6 copy                                                  | unchanged                                |
| Book error                | `Alert` role alert, `tabIndex={-1}` | §6 copy                                                  | the alert                                |
| Book success              | focus on panel title                | "Seat A-03 booked" + description                         | panel title                              |
| Cancel success            | sonner toast (polite)               | Booking cancelled. Seat A-03 at London HQ is free again. | next/previous card h2, or empty-state h2 |
| Cancel error              | page `Alert` role alert             | §6 copy                                                  | trigger, or the alert                    |

Pages keep the root skip link → `main#main`, one h1, and pass axe (SC-005). Light and dark use tokens only;
the reduced-motion rule in `globals.css` covers spinners and skeletons; never use smooth scrolling.
