# UI 02: Owner listing, seats and prices

**Task**: T018 · **Used by**: T022 (space form), T023 (dashboard list, `[spaceId]` layout, overview, publish), T024 (seats page), T030 (pricing page), T025 and T032 (qa)
**Spec**: US2, US3, AC 1.4, AC 2.1 to 2.6, AC 3.1 to 3.4, FR-006 to FR-012, FR-032, FR-033, SC-007, OQ-6, OQ-7, OQ-8
**Contracts**: [owner-spaces.md](../contracts/owner-spaces.md), [accounts.md](../contracts/accounts.md) (`/api/reference`)
**Inherits** [01-shell-accounts.md](01-shell-accounts.md): touch targets (section 1), page frame and link states (2.1, 2.4), sub-nav (3.2), owner gate (3.1), copy, time and money conventions (7), contrast (8). Only differences are written here.

## 1. Components and build map

Reuse from `@bseat/ui`: Alert, AlertDialog, Badge, Button, Card, Input, Label, NativeSelect, RadioGroup, Skeleton, Sonner.
Icons (lucide, always `aria-hidden` beside text): `PlusIcon`, `XIcon`, `Loader2Icon`, `CircleCheckIcon`, `CircleAlertIcon`.

**Two shadcn components to add (frontend-dev, T022; no token change):**

- `textarea` for the description. Same field styling as `Input`.
- `checkbox` (Radix) for utilities and slot toggles. Unchecked, its `border-input` is 1.26:1 (tokens.md F2), and for a checkbox
  the box is the control, so add `border-muted-foreground` to the unchecked box (6.00 / 7.98 on `background`). Checked: `bg-primary`
  with a `primary-foreground` tick (7.37 / 7.88). Whole `Label` row is the target, `min-h-11` on mobile.

| Screen                                    | Route                                | Task |
| ----------------------------------------- | ------------------------------------ | ---- |
| 3. Owner dashboard "My spaces"            | `/dashboard` (owner)                 | T023 |
| 4. Space form (create and edit)           | `/owner/spaces/new`, details section | T022 |
| 5. `[spaceId]` layout (name, status, 404) | `/owner/spaces/[spaceId]/*`          | T023 |
| 6. Details and publish                    | `/owner/spaces/[spaceId]`            | T023 |
| 7. Seats and cubicles                     | `/owner/spaces/[spaceId]/seats`      | T024 |
| 8. Passes and prices                      | `/owner/spaces/[spaceId]/pricing`    | T030 |

**Mobile controls.** As 01 section 1: every Button and link `max-sm:min-h-11`. Add `max-sm:h-11` to `Input` and `NativeSelect` on these screens.
Form buttons are full width below `sm` (`max-sm:w-full`).

## 2. Shared patterns

### 2.1 Field pattern (every form here)

`<form noValidate>`, RHF + `zodResolver`, the Zod schema mirrors the generated input schema. Each field: visible `<Label htmlFor>` above, optional
hint `<p id="{f}-hint" class="text-muted-foreground text-sm">`, error `<p id="{f}-error" class="text-destructive text-sm">`. Input gets
`aria-invalid` and `aria-describedby="{f}-hint {f}-error"` (only ids that exist). No asterisks: a muted line under the h1 says "All fields are
required unless marked optional." Optional fields have "(optional)" in the label text. Text is trimmed before validation. On submit with errors,
focus goes to the first invalid field (RHF `shouldFocusError`). Errors clear when the field changes.

### 2.2 Control states (all screens)

| State    | Style                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover    | Buttons and links as 01 section 2.4. Rows and tiles `bg-muted/50` (5.75 / 6.68 for `muted-foreground`). Fields are unchanged.                                     |
| Focus    | Solid `outline-2 outline-offset-2 outline-ring` on every Button, link, checkbox and radio (7.69 / 7.13), plus shadcn's `border-ring` on fields. Never removed.    |
| Disabled | shadcn `opacity-50`, no pointer events. Used only while a request is in flight (inactive controls are exempt from contrast). Never used to hide a refusal reason. |

Submit buttons are **never disabled for validation**: the user presses them and gets the field errors. Pending: `aria-busy="true"`,
`Loader2Icon` plus "Saving…" (or the verb in the table), and every field and sibling button disabled.

### 2.3 Alerts, toasts and live regions

- Outcomes the user must act on: `Alert variant="destructive"` with `role="alert"` and `tabIndex={-1}`, **focused** on appearance. Title,
  description and at most one link, from section 9. Never show `message` or `detail` from the server (01 section 7).
- Problems that belong to one field (a taken seat label, a bad price) are a **field error**, not an Alert.
- Problems that touch several fields or the whole action (publish refusal, bulk label list, seat limit) are an Alert **inside the card or
  form that caused it**, directly under its heading.
- Form saves (details, prices) show a persistent inline status next to the button: `<p role="status">` with `CircleCheckIcon` (`text-success`,
  `aria-hidden`) and text "Details saved" / "Prices saved". It is removed when any field changes again.
- Repeatable list actions (add, rename, remove) use `toast.success` and **also** update the list, so the toast is never the only record.
- Loading wrappers: `aria-busy="true"` with an sr-only `aria-live="polite"` line, as 01 section 5.4.

### 2.4 Formatting (from 01 section 7, `lib/format.ts`)

- Slot names: "Day slot", "Night slot", "24-hour slot", "Working hours". Pass names: "Day pass", "Weekly pass", "Monthly pass".
- Times are `HH:mm` 24-hour, ranges "07:00 to 19:00", overnight adds "next day". Every screen that shows slot or opening times says once, near them,
  "Times are in {IANA time zone}." (FR-033). Slot times carry no date, so no abbreviation is added.
- Counts: "No seats yet", "1 seat", "12 seats".
- Standard utility labels (`lib/format.ts`, keyed by the `/api/reference` codes; an unknown code falls back to the code with underscores
  as spaces, sentence case): `wifi` Wi-Fi, `air_conditioning` Air conditioning, `power_backup` Power backup, `parking` Parking, `meeting_room` Meeting room,
  `tea_coffee` Tea and coffee, `printer` Printer, `lockers` Lockers, `security_24h` 24-hour security, `cafeteria` Cafeteria, `accessible_entrance` Accessible entrance.
- **Money** is covered in section 8.3.

## 3. Owner dashboard: My spaces (T023)

Replaces the T014 placeholder Card ("Your spaces will appear here.") in the 01 section 5.3 slot. The h2 "My spaces", the "List a space" button
and the section's place in the page do not change. Data: `useOwnerSpacesList` (`OwnerSpaceSummary`).

**Space card** (extends 01 section 5.3): name as h3 `text-base font-medium`; muted "{area}, {city}"; `Badge` with the status text:
"Published" (`variant="default"`), "Draft" (`outline`), "Unpublished" (`secondary`). Then one muted line of facts, separated by " · ":
"12 seats" or "No seats yet", and "3 upcoming bookings" / "1 upcoming booking" / "No upcoming bookings". When `seatCount` is 0 or
`hasOfferedPass` is false, add a second muted line "To publish: add seats, price a pass" (naming only what is missing: "add seats",
"price a pass"). Only for drafts and unpublished spaces. Then the link list of 01 5.3.

| State    | Content                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Cards as above, in API order (by name). The whole card is not a link.                                                                                                                                    |
| Hover    | Each link as 2.2. The card does not change.                                                                                                                                                              |
| Focus    | Each link has the focus outline. One tab stop per link; the h3 is not focusable.                                                                                                                         |
| Disabled | n/a (no actions that disable).                                                                                                                                                                           |
| Loading  | As 01 5.3: 2 x `Skeleton h-36 rounded-xl`, `aria-busy`, sr-only polite "Loading your spaces…".                                                                                                           |
| Empty    | As 01 5.3: "You haven't listed a space yet." / "Add your space's details and seats, then set pass prices to start taking bookings." / `Button asChild` "List your first space" (to `/owner/spaces/new`). |
| Error    | As 01 5.3: `Alert variant="destructive"` "We couldn't load your spaces", "Try again in a moment.", "Try again" (refetch). Section 9 fallbacks for 401 and network.                                       |
| Success  | The cards. After creating or publishing a space, the list reflects it (invalidate `useOwnerSpacesList`).                                                                                                 |

Layout: 1 column below `md`, `md:grid-cols-2`, `gap-4`. Header row: h2 left, "List a space" right (`max-sm:w-full` stacked under the h2 below `sm`).

## 4. Space form (T022; reused for editing by T023)

`components/space-form.tsx`, `mode: 'create' | 'edit'`. Create page `/owner/spaces/new`: `<main id="main">`, h1 "List a space", muted "Add your
space's details. You'll add seats and prices next." then the "All fields are required…" line. Form width `max-w-2xl`.

### 4.1 Fields and DOM order (this is the tab order)

| #   | Control                                 | Label                           | Notes and hint                                                                                                                                                                                                                                                |
| --- | --------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Input`                                 | Name                            | max 100                                                                                                                                                                                                                                                       |
| 2   | `Textarea` (4 rows)                     | Description                     | hint "What renters should know. Up to 2,000 characters."                                                                                                                                                                                                      |
| 3   | `NativeSelect`                          | Country                         | first option "Choose a country" (value empty), then `countries` by name                                                                                                                                                                                       |
| 4   | `Input` `autoComplete="address-level2"` | City                            | max 100                                                                                                                                                                                                                                                       |
| 5   | `Input`                                 | Area or locality                | max 100                                                                                                                                                                                                                                                       |
| 6   | `Input` `autoComplete="street-address"` | Street address                  | max 200                                                                                                                                                                                                                                                       |
| 7   | `NativeSelect`                          | Time zone                       | see 4.2                                                                                                                                                                                                                                                       |
| 8   | `NativeSelect`                          | Currency                        | first option "Choose a currency", then `currencies` as "{code} {name}" (for example "INR Indian rupee"). Hint "Every price for this space uses this currency."                                                                                                |
| 9   | `fieldset` + `RadioGroup`               | legend "Opening hours"          | two tiles (01 section 4.1 tile style): "Open 24 hours" (value `always_open`, description "Renters can book day, night and 24-hour slots.") and "Fixed working hours" (value `fixed_hours`, description "One working-hours slot, for example 09:00 to 18:00.") |
| 10  | `Input type="time"`                     | Shift change time               | only when "Open 24 hours" is chosen. hint "When the day slot starts, for example 07:00. You can also change it under Passes and prices."                                                                                                                      |
| 11  | `Input type="time"` x 2                 | Opens at, Closes at             | only when "Fixed working hours" is chosen. hint under Closes at "Closing time must be after opening time on the same day."                                                                                                                                    |
| 12  | `fieldset` + checkboxes                 | legend "Utilities (optional)"   | 4.3                                                                                                                                                                                                                                                           |
| 13  | Input + button + list                   | legend "Your own utilities"     | 4.3                                                                                                                                                                                                                                                           |
| 14  | Buttons                                 | "Create space" / "Save details" | create: also link-button "Cancel" to `/dashboard` after the submit. Edit: no Cancel.                                                                                                                                                                          |

Time inputs are native (`type="time"`, value `HH:mm`; the browser may show AM/PM, the stored value is 24-hour). Shift change time has
`min="00:00" max="11:59"`. Choosing a radio **reveals** its time fields in place (rows 10 or 11 appear right after the group; focus stays on the
radio); the hidden option's fields are unmounted and not sent. Nothing is preselected for opening hours. **Shift change time is prefilled "07:00"
(OQ-A, decided in section 11).** It is the same stored value that Passes and prices edits (8.1): both pages read it from `OwnerSpace` /
`SpacePricing`, and each save invalidates both queries, so neither page shows a stale time.

Edit mode adds, in row 9's fieldset under the legend, muted: "Changing opening hours applies to new bookings only. Existing bookings keep
their times. Check Passes and prices afterwards." It also adds a second hint line under Currency (row 8), muted: "Changing the currency doesn't
convert your prices. Check Passes and prices afterwards." (OQ-G). Edit mode sends **only the changed fields** in `UpdateSpaceInput` (RHF
`dirtyFields`); `openingHours` is sent whole (mode plus its times) when any part of it changed. Nothing changed: "Save details" shows "Details
saved" without a request.

### 4.2 Country, time zone, currency

- Choosing a country sets Time zone to the country's first `timeZones` entry **unless the owner has already picked a zone themselves** (track
  `dirty` on that field; in edit mode the stored zone is never overwritten). Hint under Time zone: "Suggested for {country name}: {zone}." (the
  first zone) while a country is chosen, "Choose a country first to see suggestions." otherwise (the select is still usable).
- Options: `<optgroup label="Suggested for {country name}">` with that country's `timeZones`, then `<optgroup label="All time zones">` with the
  rest of the **offered set**, without repeats. The offered set is the union of every `countries[].timeZones` in `/api/reference` plus `UTC`,
  sorted by id (OQ-B, decided): exactly what the API accepts (`OfferedTimeZone`). Never use `Intl.supportedValuesOf('timeZone')`: browsers
  still list pre-rename ids (`Asia/Calcutta`) that the API refuses. Without a country only the second group shows. Option text is the IANA id.
- Reference loading: Country, Time zone and Currency are `disabled` with one option "Loading…", `aria-busy`; text fields work.
  Reference error: under Country, "We couldn't load the country list." with `Button variant="link" size="sm"` "Try again"; submitting stays possible
  but the three selects are required, so the submit shows their errors.

### 4.3 Utilities

- `<fieldset><legend>Utilities (optional)</legend>`: 11 checkboxes in `/api/reference` order, label = utility label (2.4). Layout: 1 column mobile, `sm:grid-cols-2`,
  `lg:grid-cols-3`. A checkbox row is the `Label` (`min-h-11` mobile, `rounded-lg border p-3`, checked row `border-primary`).
- `<fieldset><legend>Your own utilities</legend>`: `Input` labelled "Add your own utility" (hint "For example, Gym. Up to 5, 40 characters each.")
  with `Button variant="outline"` "Add utility" next to it (stacked on mobile). **Enter** in the input adds the utility and does **not** submit
  the form. Below, `<ul aria-label="Your own utilities">`: each `<li>` shows the name and a `Button variant="ghost" size="icon"
className="size-11 sm:size-8"` `XIcon`, `aria-label="Remove {name}"`.
- Add refusals (error tied to the input by `aria-describedby`, text in `text-destructive`): empty "Enter a utility name"; over 40 "Use 40
  characters or fewer"; duplicate (ignoring case) "You already added that"; a sixth "You can add up to 5 of your own utilities" (the input and
  button stay enabled so this is reachable, AC 2.2). The error clears on the next keystroke.
- Add success: the item appears, the input clears and keeps focus, an sr-only `aria-live="polite"` line says "Added {name}. {n} of 5 own utilities."
  Remove: the item goes, focus moves to the input, the line says "Removed {name}."

### 4.4 Validation copy

| Field          | Errors                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Name           | "Enter a name" · "Use 100 characters or fewer"                                                                             |
| Description    | "Enter a description" · "Use 2,000 characters or fewer"                                                                    |
| Country        | "Choose a country"                                                                                                         |
| City, Area     | "Enter a city" · "Enter an area or locality" · "Use 100 characters or fewer"                                               |
| Street address | "Enter a street address" · "Use 200 characters or fewer"                                                                   |
| Time zone      | "Choose a time zone" · from the API (only if the lists drift): "That time zone isn't supported. Choose one from the list." |
| Currency       | "Choose a currency"                                                                                                        |
| Opening hours  | "Choose when your space is open" (error under the legend; group `aria-describedby`, `aria-invalid`; focus the first radio) |
| Shift change   | "Enter a shift change time" · "Use a time from 00:00 to 11:59"                                                             |
| Opens at       | "Enter an opening time"                                                                                                    |
| Closes at      | "Enter a closing time" · "Closing time must be after the opening time" (OQ-7)                                              |

A 400 from the API (`errors[]`) maps each path to the matching field and shows the message above; a path with no match shows the Alert "Check
the details" (section 9) and focuses it.

### 4.5 States

| State    | Behaviour                                                                                                                                                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Create: empty except Shift change "07:00" (hidden until chosen). Edit: prefilled from `OwnerSpace`.                                                                                                                                                                                                                   |
| Hover    | Section 2.2; opening-hours tiles `bg-muted/50`.                                                                                                                                                                                                                                                                       |
| Focus    | Section 2.2; the selected tile also keeps `border-primary ring-1 ring-primary bg-primary/5` (01 section 4.1).                                                                                                                                                                                                         |
| Disabled | While saving: all fields, utilities controls and buttons disabled; submit `aria-busy`, "Creating…" or "Saving…". While reference loads: the three selects (4.2).                                                                                                                                                      |
| Loading  | Create: form renders at once, selects as 4.2. Edit: page-level, `aria-busy`, 6 x `Skeleton h-16`, sr-only polite "Loading details…" (the layout in section 5 has already loaded the space, so this shows only when the details query is separate).                                                                    |
| Empty    | n/a (a form). The empty "no custom utilities yet" is just an empty list with no placeholder text.                                                                                                                                                                                                                     |
| Error    | Field errors (4.4). Non-field failure: destructive Alert at the top of the form, focused: 400 without a field, 404 (edit) shows the layout's not-found state instead, 401 per 01, other statuses and network per section 9 (title "We couldn't save your space", description from the fallback table). Input is kept. |
| Success  | Create: go to `/owner/spaces/{id}`, `toast.success("Space created")` (until T023 merges: `/dashboard`, same toast). Edit: inline status "Details saved" (2.3), the form resets to the returned `OwnerSpace`, and the pricing query is invalidated; the Badge in the layout (section 5) is unchanged.                  |

### 4.6 Layout

Mobile: one column, buttons stacked and full width. From `md`: `grid-cols-2 gap-4` pairs, in DOM order: Country + Time zone, City + Area, Currency
alone, Opens at + Closes at (when shown). Name, Description, Street address, opening-hours group and utilities span both columns. Because
DOM order equals reading order, the tab order is the same at every breakpoint.

## 5. `[spaceId]` layout (T023)

`app/(app)/owner/spaces/[spaceId]/layout.tsx` (client, `useOwnerSpacesGet`). It renders no `<main>` in the success state. It does not mount `children`
until the space has loaded, so a 404 fires no child requests.

Header (inside the `max-w-6xl` frame, above the sub-nav of 01 section 3.2): the space name (`p`, `text-lg font-semibold`, truncates with `break-words`
on mobile) and the status `Badge` (text as section 3), then `<nav aria-label="Space management">`. Page h1s are "Details", "Seats", "Passes and
prices", each a page `<main id="main">` heading.

| State    | Behaviour                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Name, badge, sub-nav, then `{children}`. Sub-nav links per 01 3.2, current item `aria-current="page"`.                                                                                                                                                                                                                                                                        |
| Hover    | Sub-nav hover `bg-muted` as 01 3.2.                                                                                                                                                                                                                                                                                                                                           |
| Focus    | As 2.2.                                                                                                                                                                                                                                                                                                                                                                       |
| Disabled | n/a.                                                                                                                                                                                                                                                                                                                                                                          |
| Loading  | `main` with `Skeleton h-6 w-48` (name), `Skeleton h-9 w-full max-w-md` (sub-nav), `Skeleton h-40 rounded-xl`; `aria-busy`, sr-only polite "Loading space…", sr-only h1 "Loading".                                                                                                                                                                                             |
| Empty    | n/a.                                                                                                                                                                                                                                                                                                                                                                          |
| Error    | 404 (another owner's space, a random id or a removed one, **identical**, AC 2.6): `main`, h1 "We couldn't find that space", muted "Check the address, or go back to your dashboard.", `Button asChild` "Go to dashboard". Other errors: `main`, h1 "We couldn't load this space", `Alert variant="destructive"` (section 9 fallbacks) with "Try again" (refetch). 401 per 01. |
| Success  | The header and children. Editing details or publishing updates the name and Badge here (shared cache key).                                                                                                                                                                                                                                                                    |

The 404 state never names the space, the owner or why. It must read the same for a renter-owned or unknown id.

## 6. Details and publish (T023)

`/owner/spaces/[spaceId]` renders, inside its own `<main id="main">`: h1 "Details", the **Publishing** card, then the space form in `edit` mode (section 4).
Single column `max-w-2xl` below `lg`; no side-by-side layout.

### 6.1 Publishing card

`Card`, `<section aria-labelledby="publish-heading">`, h2 "Publishing". Contents by status:

| Status      | Text                                                                                             | Button                                 |
| ----------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Draft       | "This space is a draft, so renters can't see it. Before you publish, add seats and set prices."  | `Button` "Publish"                     |
| Published   | "This space is published. Renters can find it in search."                                        | `Button variant="outline"` "Unpublish" |
| Unpublished | "This space is hidden from search. Existing bookings stay valid and renters can still see them." | `Button` "Publish"                     |

For Draft and Unpublished, "seats" and "prices" are links to the Seats and Passes and prices pages once those routes exist (plain text before).
The button is **one element whose label changes** (stable key), so focus survives a status change.

**Publish.** Never disabled for missing data (AC 2.4 needs the refusal). Pending: "Publishing…", `aria-busy`.

- Success (200): Badge and card text switch to Published, a `role="status"` line "Published. Renters can now find this space." appears in the
  card, the list cache is invalidated.
- 422 `listing:publish-incomplete`: `Alert variant="destructive"` **inside the card**, focused. Title "Add what's missing to publish". Description
  "To publish this space you still need to:" then a `<ul>` built from `missing`: `seat` gives "Add at least one seat" (link "Add seats", to Seats),
  `pricedPass` gives "Price at least one pass" (link "Set prices", to Passes and prices). Links appear only once their routes exist. Status stays
  Draft or Unpublished. The Alert clears on the next Publish press.

**Unpublish** opens `AlertDialog`: title "Unpublish this space?", description "It will disappear from search. Existing bookings stay valid and
renters can still see them.", buttons `AlertDialogCancel` "Keep published" (initial focus) and `AlertDialogAction` "Unpublish"
(`buttonVariants({ variant: 'destructive' })`). Pending: action `preventDefault`, disabled, "Unpublishing…", "Keep published" disabled, Esc ignored (001
cancel dialog pattern). Success: close, Badge switches to "Unpublished", status line "Unpublished. This space is hidden from search."
Focus returns to the same button (now "Publish"). Error: close, Alert in the card as above (title "We couldn't unpublish this space", fallback copy).

### 6.2 States (details page)

| State    | Behaviour                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| Default  | h1, Publishing card, form prefilled.                                                                              |
| Hover    | 2.2.                                                                                                              |
| Focus    | 2.2. Tab order: main nav, sub-nav, Publish or Unpublish, then the form fields in 4.1 order, "Save details".       |
| Disabled | Publish pending disables only the Publishing card; the form pending disables only the form. They are independent. |
| Loading  | Layout skeleton (section 5) covers the space load.                                                                |
| Empty    | n/a.                                                                                                              |
| Error    | Publish and unpublish: Alert in the card (6.1). Save: section 4.5. Space load: section 5.                         |
| Success  | Publish and unpublish: 6.1. Save: "Details saved".                                                                |

## 7. Seats and cubicles (T024)

`/owner/spaces/[spaceId]/seats`. h1 "Seats". Under it, `p` muted: "No seats yet" / "12 seats" / "200 seats. You've reached the limit of 200."
and a second muted line "A space can have up to 200 seats." Single column `max-w-4xl` inside the frame.

Order of sections (= DOM and tab order): page Alert slot (focus target for list-level failures), **Add seats** (h2; two cards), **Cubicles** (h2),
**Your seats** (h2). Cubicles come before the list because the add forms use them in a select.

### 7.1 Add one seat (`Card`, h3 "Add one seat")

Fields: **Label** (`Input`, hint "Up to 20 characters, for example A-12."), **Cubicle (optional)** (`NativeSelect`, first option "No cubicle"), **Features (optional)**
(`Input`, hint "Separate with commas, for example standing desk, monitor arm. Up to 10, 40 characters each."; split on commas, trimmed, blanks
dropped, repeats dropped ignoring case). Button "Add seat".
Errors: Label "Enter a label" · "Use 20 characters or fewer". Features "Use 10 features or fewer" · "Keep each feature to 40 characters or fewer"
(OQ-D: contract limits, owner-spaces.md). Cubicle select states: loading, one disabled option "Loading cubicles…"; load
error, only "No cubicle" plus muted "We couldn't load cubicles." and `Button variant="link" size="sm"` "Try again".

Success: `toast.success("Seat {label} added")`, the list updates, **Label clears and keeps focus**, Cubicle and Features keep their values (so
a run of seats in one cubicle is quick). `label-taken` is a **field error on Label** (section 9), the label is kept.

### 7.2 Add many seats (`Card`, h3 "Add many seats")

Fields in tab order, each with a visible `Label`:

| #   | Field                     | Control                     | Hint                                                                 | Errors                                                                                                                                                                                                                                 |
| --- | ------------------------- | --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Label prefix              | `Input`, may be empty       | "The text before each number, for example A-."                       | "Use 15 characters or fewer"                                                                                                                                                                                                           |
| 2   | From number               | `Input inputMode="numeric"` | "The first number, for example 1."                                   | "Enter a whole number, 0 or higher"                                                                                                                                                                                                    |
| 3   | To number                 | `Input inputMode="numeric"` | "The last number, for example 20."                                   | "Enter a whole number" · "Enter a number that is {from} or higher" · "That adds {n} seats. You can add up to 200 at once." · "That adds {n} seats, but a space can have 200 and this one has {current}. You can add {remaining} more." |
| 4   | Pad numbers to (optional) | `Input inputMode="numeric"` | "Digits to pad with zeros: 2 turns 1 into 01. Leave empty for none." | "Enter a number from 1 to 4, or leave it empty"                                                                                                                                                                                        |
| 5   | Cubicle (optional)        | `NativeSelect`              | all new seats go in it                                               | as 7.1                                                                                                                                                                                                                                 |
| 6   | Features (optional)       | `Input`                     | all new seats get these                                              | as 7.1                                                                                                                                                                                                                                 |
| 7   | Button                    | "Add {n} seats"             |                                                                      | n=1 "Add 1 seat"; invalid or empty: "Add seats"                                                                                                                                                                                        |

A label longer than 20 characters (prefix plus the **widest** number after padding, usually the last) is an error on field 1: "Labels can be up to 20
characters including the number. Shorten the prefix." Numbers use `type="text"` with `inputMode="numeric"`, not `type="number"` (no spinner, no
locale or scroll surprises).

**Preview** (the confirm step): between field 6 and the button, `<p role="status" aria-live="polite" aria-atomic="true">` shows, when fields 1 to 4
are valid: "Adds {n} seats: {first} to {last}." ("Adds 1 seat: A-1."). Example: prefix "A-", 1, 20 gives "Adds 20 seats: A-1 to A-20."; with Pad to 2:
"Adds 20 seats: A-01 to A-20." Update on change, debounced ~400 ms so the announcement does not chatter. While fields are invalid the line is empty
(the errors speak). The button label repeats the count, so pressing "Add 20 seats" is the confirmation (OQ-C).

Pending: button "Adding…", all of the card disabled. Success: `toast.success("{n} seats added")` (description "{first} to {last}"), the card resets to
empty, focus goes to field 1, the list updates. The request is all-or-nothing: on any refusal **no seats were added**, and the Alert says so.

### 7.3 Cubicles (h2 "Cubicles")

List `<ul aria-label="Cubicles">`, one row per cubicle: name (`font-medium`), muted "{n} seats" ("No seats yet"), `Button variant="outline" size="sm"` "Rename"
with sr-only " cubicle {name}", and "Remove" with the same suffix. Above the list: `Input` "Cubicle name" (hint "Groups seats, for example Bay 1.") and `Button` "Add cubicle", in one row
from `sm`, stacked below. Rename turns that row into an inline form (Input prefilled and focused, "Save", "Cancel"; focus returns to its Rename button after
either). Name errors: "Enter a name" · "Use 100 characters or fewer" (OQ-D: cubicle names are 1 to 100 characters, as the database check) ·
`cubicle-name-taken` as a **field error**. Long names wrap (`break-words`), in the list and in the Cubicle selects.

Remove opens `AlertDialog`: title "Remove {name}?", description "This removes the cubicle and its {n} seats together. Bookings that ended keep the
seat and cubicle names. You can't remove it while any of its seats has upcoming bookings." (for 0 seats, drop the second sentence's seat count: "This
removes the cubicle."), buttons "Keep cubicle" (initial focus) and "Remove cubicle" (destructive). Pending "Removing…" (as 6.1). Success: toast
`Cubicle {name} removed`, both lists update, focus to the Cubicle name input. 409 `seat-has-future-bookings`: dialog closes, page Alert (focused).
Empty: muted "No cubicles yet. Use cubicles to group seats, for example Bay 1." (the add form stays visible).

### 7.4 Your seats (h2 "Your seats")

`<ul aria-label="Seats">`, `divide-y rounded-xl border bg-card`, one `<li>` per seat in API order (by label). Row: label (`font-medium`), muted cubicle name
or "No cubicle", muted features joined by ", ", then actions: `Button variant="outline" size="sm"` "Edit" + sr-only " seat {label}" and "Remove" + sr-only
" seat {label}". Mobile: label and cubicle stacked, actions below as two buttons (`grid grid-cols-2 gap-2`); `sm` and up: one row, actions right.
Reserved: later tasks (T048, T052) add the "today" state and the calendar to the same row; this spec does not.

**Edit** swaps the row for an inline form: Label, Cubicle (select, includes "No cubicle"), Features, "Save", "Cancel". Focus goes to Label. Cancel or a successful
save returns focus to that row's Edit button. A `label-taken` is a field error on Label. Saved: toast "Seat {label} saved".

**Remove** opens `AlertDialog`: title "Remove seat {label}?", description "It will no longer be listed or bookable. Bookings that ended keep its label.",
buttons "Keep seat" (initial focus) and "Remove seat" (destructive). Pending "Removing…". Success: toast "Seat {label} removed"; list updates; **focus moves to the
next row's Edit button, else the previous row's, else the Label field of Add one seat.** 409 `seat-has-future-bookings`: dialog closes, page Alert (focused), the row stays.

### 7.5 States (seats page)

| State    | Behaviour                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Count, forms, cubicles, seat list as above.                                                                                                                                                                                                                                         |
| Hover    | 2.2; list rows `bg-muted/50`.                                                                                                                                                                                                                                                       |
| Focus    | 2.2. Tab order: main nav, sub-nav, Add one seat (Label, Cubicle, Features, Add seat), Add many (fields 1 to 7), cubicle name, Add cubicle, each cubicle row, then each seat row (Edit, Remove). The preview is not focusable.                                                       |
| Disabled | A form's own fields and button while it submits; row buttons while that row's request runs; a dialog's buttons while pending. Other sections stay usable.                                                                                                                           |
| Loading  | Count line `Skeleton h-4 w-24`; forms render at once; cubicles `Skeleton h-12 rounded-lg` x 2 and seats `Skeleton h-14` x 4, each list wrapper `aria-busy`, sr-only polite "Loading cubicles…" / "Loading seats…".                                                                  |
| Empty    | Seats: `Card` "No seats yet." (`font-medium`), muted "Add seats one at a time or many at once with a label pattern. You need at least one seat to publish." Cubicles: 7.3.                                                                                                          |
| Error    | List load failure: `Alert variant="destructive"` in place of the list ("We couldn't load your seats" / "We couldn't load your cubicles", "Try again in a moment.", "Try again"). Action failures: section 9, field error or Alert per 2.3. The forms stay usable when a list fails. |
| Success  | Toast plus the updated list, focus as above.                                                                                                                                                                                                                                        |

Page Alert slot (for remove, rename-from-list and 404 refusals) is a single `<div>` under the count lines. Shown Alerts are replaced, not stacked.

### 7.6 Layout

Mobile: all cards single column, full-width buttons, seat rows stack. `sm`: label, cubicle and actions on one row, Cubicle name and "Add cubicle" inline. `lg`: the two Add
cards side by side (`lg:grid-cols-2 gap-4`; Add one first). Seat list always one column (up to 200 rows).

## 8. Passes and prices (T030)

`/owner/spaces/[spaceId]/pricing`. h1 "Passes and prices". Muted intro: "Choose which slots you offer and set a price for each pass. Renters pay you directly, outside BSeat."
Then muted: "Times are in {time zone}. Prices are in {currency name} ({code}). Change the currency under [Details](/owner/spaces/{id})." Data: `GET`/`PUT …/pricing`
(`SpacePricing`, `UpdatePricingInput`). The time zone comes from the layout's `OwnerSpace` (section 5, already loaded); the currency name is
`new Intl.DisplayNames(['en'], { type: 'currency' }).of(code)`, as the API names currencies. One `<form noValidate>` with one **Save prices** button at the end.

### 8.1 Structure and keyboard order

1. **Shift change time** (24-hour spaces only): `Input type="time" min="00:00" max="11:59"`, label "Shift change time", hint "The day slot starts at this time and runs for 12
   hours. The night slot runs for the next 12. The 24-hour slot runs from this time to the same time the next day." Error "Enter a shift change time" · "Use a time from 00:00 to 11:59".
   Fixed-hours spaces: no field; muted "Your space has fixed working hours, so it has one slot. Change the hours under [Details](…)."
2. **One `Card` per slot**, as `<fieldset>` with a `<legend>` (slot name, `font-medium`), in order Day, Night, 24-hour (or only Working hours). Inside, in order:
   - Derived times as muted text: "07:00 to 19:00" / "19:00 to 07:00 next day" / "07:00 to 07:00 next day" / "09:00 to 18:00". For 24-hour spaces they recompute from the
     shift field as it changes (wall-clock only: day = T to T+12 h, night = T+12 h to T next day, 24-hour = T to T next day; T is at most 11:59, so day ends the same day).
     Invalid or empty shift shows "–". After a save the API's `startTime`, `endTime`, `endsNextDay` replace them.
   - 24-hour spaces: `Checkbox` "Offer this slot". Fixed-hours: no checkbox, text "This is your only slot, so it is always offered." (AC 3.2).
   - Three price fields (8.2), tab order Day pass, Weekly pass, Monthly pass.
3. The muted line "Leave a price empty if you don't offer that pass." comes once, before the first slot card; every price input points to it with `aria-describedby`.
4. **Save prices** and the inline status. Save sends `shiftChangeAt` (24-hour spaces only) and one `slots` entry per slot card, in card order,
   each with its `enabled` value and all three prices (`null` for empty). A successful save also invalidates `useOwnerSpacesGet` (shift time,
   `hasOfferedPass`) and `useOwnerSpacesList`.

An off slot is muted (`text-muted-foreground` heading plus the text "Off. Renters can't book this slot. Its prices are kept for when you turn it back on."), but its price inputs **stay enabled**
and keep their values (OQ-E, decided: the API stores the prices of a disabled slot and offers none of them until it is on again).
The accessible name of each price field is "{Pass name} price in {code}" plus its group: the `Label` text is the visible "Day pass" with an sr-only suffix " price in INR", and the `fieldset` legend supplies the slot.

### 8.2 Price field and money format

Each price field: `Label` visible text "Day pass", "Weekly pass", "Monthly pass" (+ sr-only " price in {code}"), muted sub-label "1 day", "7 days in a row", "30 days in a row".
Control: `Input type="text" inputMode="decimal" autoComplete="off"`, placeholder "Not offered", with the currency code shown as a visible **prefix** inside the box (`<span aria-hidden="true">INR</span>`,
`text-muted-foreground text-sm`, input `pl-12`), so the unit is never only in a heading. No symbol, no thousands separator, **`.` is the decimal separator whatever the locale**: this is what the API accepts.

- **Accepted**: `^(0|[1-9]\d{0,9})(\.\d{1,2})?$` and greater than zero (the API's money rule). So "1500", "1500.5", "1500.50" are valid; "1,500", "₹1500", ".5", "007", "-5" are not. Whitespace around is trimmed.
- **Empty** means not offered (AC 3.3), sent as `null`.
- **Check order and error text** (one error at a time, `text-destructive`, id `{f}-error`, `aria-invalid`, `aria-describedby="pricing-hint {f}-preview {f}-error"`):
  1. contains anything but digits and one dot, starts with a zero followed by another digit ("007"), or starts or ends with the dot: "Enter an amount like 1500 or 1500.50" ("0.50" passes this check)
  2. more than two decimals: "Use at most two decimal places"
  3. equals zero: "Enter a price greater than zero"
  4. more than 10 whole digits: "That price is too large"
- **Preview** under a valid, non-empty field: `<p id="{f}-preview" class="text-muted-foreground text-sm">Shows as ₹1,500.00</p>`, formatted with
  `formatMoney` (8.3, never hand-built). It exists so a slipped zero is noticed. It is read on focus through `aria-describedby`, not announced live.
- Validated on submit, then on blur and change once an error has shown. After a successful save the field shows the API's two-decimal string ("1500.50").

### 8.3 Money across these screens

Inputs: plain decimal, `.` separator, no symbol, the code as a prefix. Every currency accepts up to two decimals (FR-011, R-8), and the API returns two.
Read-only prices (the Shows-as preview, and later renter views) use one helper, `formatMoney({ amount, currency })` in `lib/format.ts`, which **never rounds**
(OQ-F, decided; amends 01 section 7):

- `digits` = `new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits` (2 for INR, 0 for JPY, 3 for KWD).
- Format `Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'symbol', minimumFractionDigits: m, maximumFractionDigits: Math.max(digits, 2) })`
  where `m` is `digits`, or 2 when the amount's cents are not zero and `digits` is below 2.
- Pass the **string** amount to `format()` (exact decimal, no float). Results: "₹1,500.00", "$1,500.00", "¥1,500" (JPY "1500.00"), "¥1,500.50" (JPY "1500.50"), "KWD 1,500.000".

### 8.4 States (pricing page)

| State    | Behaviour                                                                                                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Shift field (24-hour spaces), slot cards with prefilled values, empty prices showing "Not offered".                                                                                                                                                                                                                                               |
| Hover    | 2.2; checkbox row `bg-muted/50`.                                                                                                                                                                                                                                                                                                                  |
| Focus    | 2.2. Tab order: main nav, sub-nav, Shift change time, then per slot: Offer this slot, Day pass, Weekly pass, Monthly pass; then Save prices.                                                                                                                                                                                                      |
| Disabled | While saving: every field, checkbox and the button disabled, button "Saving…" with `aria-busy`.                                                                                                                                                                                                                                                   |
| Loading  | `Skeleton h-10 w-48` (shift) and 2 x `Skeleton h-44 rounded-xl`, wrapper `aria-busy`, sr-only polite "Loading prices…".                                                                                                                                                                                                                           |
| Empty    | Every price is empty: muted line above the first card "You haven't set any prices yet. Set at least one to publish this space." Empty fields read "Not offered".                                                                                                                                                                                  |
| Error    | Load failure: `Alert variant="destructive"` "We couldn't load prices", "Try again in a moment.", "Try again". Save failure: field errors per 8.2 (client) and API 400 `errors[]` mapped by path (`slots.{i}.prices.{pass}`, `shiftChangeAt`); anything else the Alert "We couldn't save your prices" (section 9 fallbacks), focused, inputs kept. |
| Success  | Inline `role="status"` "Prices saved" with `CircleCheckIcon` next to the button; fields show the returned values; derived times from the response. Removed on the next change.                                                                                                                                                                    |

### 8.5 Layout

Mobile: cards stacked, each price field full width, one per row. `sm` and up: the three price fields in `grid-cols-3 gap-4` inside the card. Page `max-w-3xl`. Shift field `max-w-48`.
"Save prices" full width below `sm`, inline status under it (right of it from `sm`).

## 9. Problem copy

### 9.1 Web copy (`lib/marketplace-problems.ts`, as 01 section 7)

Titles state the outcome; descriptions give the next step. Interpolate only what the client holds. **Fallbacks** by status, when `type` is unmapped (no server `detail` is
ever shown): 400 and 422 "Check the details and try again."; 401 title "Your session has ended" with "Sign in" link (01 2.5); 403 "You don't have access to this."; 404 "We couldn't find that. It may have been
removed."; 409 "That changed while you were working. Reload and try again."; network "Check your connection and try again."; 5xx "Something went wrong on our side. Try again in a moment."
Fallback Alert titles: "We couldn't {action}" where the action is the screen's own ("save your space", "publish this space", "unpublish this space", "add seats", "remove this seat", "save your prices"), or "Something went wrong" when no action applies.

| `type` (after `urn:bseat:problem:`) | Action                                          | Shown as            | Title                                        | Description                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------- | ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validation` (400)                  | any form save                                   | field errors        | (none)                                       | Messages from 4.4, 7.x and 8.2 on the matching field                                                                                                |
| `validation` (400), unmapped path   | any form save                                   | Alert               | Check the details                            | Check the details and try again.                                                                                                                    |
| `http-403`                          | any owner action                                | Alert               | Not allowed                                  | You don't have access to this.                                                                                                                      |
| `http-404`                          | space load or any space action                  | layout 404 (5)      | We couldn't find that space                  | Check the address, or go back to your dashboard.                                                                                                    |
| `http-404`                          | seat edit or remove                             | page Alert          | Seat not found                               | It may have been removed. The list is up to date.                                                                                                   |
| `http-404`                          | cubicle edit or remove, add seat with a cubicle | page Alert          | Cubicle not found                            | It may have been removed. The list is up to date.                                                                                                   |
| `listing:publish-incomplete`        | publish                                         | Alert in card       | Add what's missing to publish                | To publish this space you still need to: (list from `missing`, 6.1)                                                                                 |
| `listing:seat-limit`                | add one, add many                               | Alert in card       | Seat limit reached                           | A space can have up to 200 seats. This one has {current}, so you can add {remaining} more. No seats were added.                                     |
| `listing:label-taken`               | add one, edit seat                              | field error (Label) | (none)                                       | "{label} is already used by another seat. Choose a different label."                                                                                |
| `listing:label-taken`               | add many                                        | Alert in card       | Some labels are already used                 | "{labels, first 5, comma-separated}{ and N more} already exist in this space. No seats were added. Change the prefix or the numbers and try again." |
| `listing:cubicle-name-taken`        | add or rename cubicle                           | field error (name)  | (none)                                       | "Another cubicle already has that name. Choose a different one."                                                                                    |
| `listing:seat-has-future-bookings`  | remove seat                                     | page Alert          | Seat has upcoming bookings                   | "{label} can't be removed until its bookings end or are cancelled by the renter."                                                                   |
| `listing:seat-has-future-bookings`  | remove cubicle                                  | page Alert          | A seat in this cubicle has upcoming bookings | "{name} can't be removed until those bookings end or are cancelled by the renter. Nothing was removed."                                             |

Problems this spec's screens cannot receive (booking rules, occupancy, layout) have web copy in ui/03, ui/04 and ui/05.

### 9.2 API `title` and `detail`

Moved to the [problem copy registry](../contracts/README.md#problem-copy-registry-title-and-detail) in contracts/README.md (architect, T018),
which is now the single source. The web never prints them (9.1); it builds its own list text from the extension members (`missing`, `labels`,
`conflicts`).

## 10. Accessibility, contrast and review notes

- One `<h1>` and one `<main id="main">` per page; headings never skip (details: h1, h2 "Publishing", form `legend`s; seats: h1, h2 sections, h3 card titles; pricing: h1, fieldset legends). Each seat or cubicle action has a unique accessible name that contains its visible label.
- All fields have a `Label`; errors are tied with `aria-describedby` and `aria-invalid` (2.1). Group controls use `fieldset` and `legend`. Required is stated once in text, not by colour.
- Status and state are always text ("Draft", "Off. Renters can't book this slot.", "Prices saved"), never colour alone. Icons are `aria-hidden` beside text.
- Pairs used (all from tokens.md, no new pair): `foreground`, `muted-foreground` on `background`, `card`, `muted/50` (6.00 and up); `destructive` on `card` for field errors and Alerts (5.43 / 6.15); `success` on `card` for "saved" (5.65 / 7.67); `primary` on `background` for links (7.69 / 7.88);
  `primary-foreground` on `primary` for Publish and Save (7.37 / 7.88). Focus outline and selected borders `ring` / `primary` 7.69 / 7.13. Disabled controls (`opacity-50`) are inactive and exempt. Checkbox border follows section 1 (6.00 / 7.98).
- No raw colours and no token change. No motion beyond shadcn defaults and the spinner.
- qa (T025, T032): axe on each screen in these states: dashboard (empty, list, error), `/owner/spaces/new` (empty with errors, "Open 24 hours" and "Fixed working hours" open), details (draft with publish refusal Alert, published, unpublish dialog open), seats (empty, list, bulk with `label-taken` Alert,
  remove dialog, row in edit mode), pricing (24-hour with an invalid price, fixed-hours, empty, after save). Screenshots at 375, 768 and 1280 px, light and dark. Keyboard-only run: create a space, add 20 seats, set prices, publish, without a pointer.

## 11. Decisions (architect review, T018, 2026-10-28)

The open questions OQ-A to OQ-H are closed. Decisions marked **assumption** are product behaviour that spec.md does not settle; they use the
conservative option and a human may override them.

| Id   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Recorded in                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| OQ-A | `CreateSpaceInput` keeps `shiftChangeAt` required for "Open 24 hours" (the database check needs it). The create form shows it prefilled "07:00" (the spec's example), and both Details (`PATCH`, `openingHours`) and Passes and prices (`PUT …/pricing`, `shiftChangeAt`) edit the one stored value; each save invalidates the other page's query (4.1, 8.1).                                                                                                                                         | 4.1, 8.1; owner-spaces.md; T020, T027              |
| OQ-B | The API allow-list wins. The offered zones are exactly the union of `countries[].timeZones` in `/api/reference` plus `UTC` (`OfferedTimeZone`); the web builds "All time zones" from that set, never from `Intl.supportedValuesOf('timeZone')` (4.2). No API change.                                                                                                                                                                                                                                  | 4.2, 4.4; accounts.md, owner-spaces.md; T020, T022 |
| OQ-C | The live preview plus the count-labelled button ("Add 20 seats") is the confirm step; no dialog (7.2).                                                                                                                                                                                                                                                                                                                                                                                                | 7.2; T024                                          |
| OQ-D | Cubicle name 1 to 100 characters after trim (matches the merged `cubicle_name_length` check). Seat features: at most 10, each 1 to 40 characters after trim, no repeats ignoring case; a new `seat_features_max` check bounds the count in the database (T021).                                                                                                                                                                                                                                       | 7.1, 7.3; owner-spaces.md, data-model.md; T021     |
| OQ-E | Prices of a disabled slot are kept: `PUT` stores what it is sent, `GET` returns them, and none of them is offered (listing, search, publish check, booking) until the slot is on again.                                                                                                                                                                                                                                                                                                               | 8.1; owner-spaces.md, data-model.md; T027          |
| OQ-F | The API is unchanged: every currency accepts up to two decimals (FR-011, R-8), so "1500.50" is valid for JPY (**assumption**; the alternative, refusing decimals beyond the currency's minor unit, needs a product call). Display never rounds: `formatMoney` uses the currency's own digits and two when the amount has cents (8.3), so JPY "1500.00" shows "¥1,500" and "1500.50" shows "¥1,500.50". This amends 01 section 7.                                                                      | 8.3; 01 section 7; T027, T030                      |
| OQ-G | **Assumption:** changing the currency or the opening mode is allowed at any time, including on a published space with prices or bookings. Amounts are not converted, bookings keep their price, currency and slot snapshot (FR-013, edge case), and the other mode's slots and prices are kept for a switch back. The Details form warns under Currency and Opening hours (4.1). A switch can leave a published space with no offered pass; it stays published (FR-008 applies at publish time only). | 4.1; owner-spaces.md, data-model.md; T020, T027    |
| OQ-H | The web never shows `title` or `detail` (01 section 7 wins). contracts/README.md now says so and holds the problem copy registry (9.2).                                                                                                                                                                                                                                                                                                                                                               | 9.2; contracts/README.md                           |
