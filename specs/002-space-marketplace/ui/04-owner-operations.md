# UI 04: Occupancy, availability calendars and owner bookings

**Task**: T046 · **Used by**: T048 (occupancy on the seats page), T052 (availability page), T058 (owner bookings page), T049, T053 and T059 (qa)
**Spec**: US5, US6, US7 (owner side), AC 5.1 to 5.4, AC 6.1 to 6.5, AC 7.3, FR-022 to FR-025, FR-027, FR-032, FR-033, SC-007, OQ-5
**Contracts**: [owner-operations.md](../contracts/owner-operations.md), [owner-spaces.md](../contracts/owner-spaces.md) (`OwnerSeat.today`, `calendar`), [README problem types](../contracts/README.md#problem-types-introduced-by-this-feature), research R-11
**Inherits** [01-shell-accounts.md](01-shell-accounts.md): touch targets (section 1), link states (2.4), sub-nav (3.2), copy, time and money conventions (7), contrast (8); and [02-owner-listing.md](02-owner-listing.md): field pattern (2.1), control states (2.2), alerts, toasts and live regions (2.3), formatting (2.4), the `[spaceId]` layout and its 404 (5), the seats page it extends (7). Only differences are written here.

## 1. Components and build map

Reuse from `@bseat/ui`: Alert, AlertDialog, Badge, Button, Card, Checkbox, Input, Label, NativeSelect, RadioGroup, Skeleton, Sonner, Textarea.
**No new shadcn component and no token change.** The weekday toggles are `Checkbox`-backed chips styled with existing tokens (3.2).
Icons (lucide, always `aria-hidden` beside text): `CircleIcon`, `LockIcon`, `UserIcon`, `CheckIcon`, `InfoIcon`, `CircleCheckIcon`, `CalendarIcon`, `Loader2Icon`, `ChevronDownIcon`, `XIcon`. If a name is missing in the pinned lucide version use the nearest icon; the text carries the meaning.

| Screen                                   | Route (under `/owner/spaces/[spaceId]`) | Task |
| ---------------------------------------- | --------------------------------------- | ---- |
| 2. Seats page: today state, select, mark | `/seats` (extends 02 section 7)         | T048 |
| 3. Availability (shared and per-seat)    | `/availability`                         | T052 |
| 4. Bookings                              | `/bookings`                             | T058 |

Sub-nav labels "Availability" and "Bookings" are already fixed (01 section 3.2). These pages sit under the owner gate (01 section 3.1) and the `[spaceId]` layout (02 section 5), so a 404 for a foreign or unknown space is the layout's, and no request fires from the page.
Page frame `max-w-6xl`. Every page has one `<main id="main">` and one `<h1>`. **Mobile controls** as 02 section 1.

Shared reminder, one muted line near the top of each page: "Times are in {IANA time zone}." (FR-033). Dates in this spec are pure local dates (`LocalDate`), formatted date-only with the year ("Tue, 3 Nov 2026", 01 section 7), with no zone label per date.

## 2. Seats page: today state, selecting seats, marking occupied and vacant (T048)

Adds to 02 section 7.4 ("Your seats"). The h2, the list element and row order do not change. Data: `useOwnerSpacesListSeats` (`OwnerSeat.today`), `useOwnerOperationsListOccupancy` (all marks that have not ended, grouped by seat in the web), `useOwnerOperationsMarkOccupied`, `useOwnerOperationsEndOccupancy`.

### 2.1 Today state on a row

Directly after the seat label, in each row, a `Badge` with an icon and text (never colour alone):

| `today.state` | Badge                                                  | Extra on the row                                                                                                                                |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `vacant`      | `variant="outline"`, `CircleIcon` "Vacant"             | none                                                                                                                                            |
| `occupied`    | `variant="secondary"`, `LockIcon` "Occupied by you"    | muted "Note: {note}" when set (`break-words`, 200 characters at most); no note, no line                                                         |
| `booked`      | `variant="secondary"`, `UserIcon` "Booked by a renter" | muted link-style text "See bookings" to `/owner/spaces/{id}/bookings` (`text-primary underline-offset-4`). Renter identity is never shown here. |

The page shows once, under the "Your seats" h2, muted: "Today means {today's date} in {zone}. Only you can see occupancy notes. Renters see a taken seat." Seats on their own calendar also show `Badge variant="outline"` "Own calendar" (T052, `OwnerSeat.calendar === 'own'`).
Mobile: badge under the label; `sm` and up: on the label line. Contrast: `secondary-foreground` on `secondary` 16.42 / 14.48; outline badge text `foreground`.

### 2.2 Occupancy marks per seat (OQ-5)

Each row that has at least one mark (current or future) gets a `Button variant="link" size="sm"` "Occupancy ({n})" with `aria-expanded` and `aria-controls`, sr-only suffix " for seat {label}" (`ChevronDownIcon` rotates). Closed by default; toggling moves no focus. It opens a `<ul aria-label="Occupancy for seat {label}">` under the row, one item per mark, soonest first:

- Text: "{start date} to {end date}" or "From {start date}, no end date", muted note ("Note: {note}") when set, and a text status: "Current" (covers today) or "Upcoming" (starts later).
- Action `Button variant="outline" size="sm"`: **"Mark vacant"** for the **current** mark; **"Remove"** for an **upcoming** mark. Both call `POST …/occupancy/{markId}/end`. Sr-only suffix " seat {label}, {range}" so every button has a unique name.
- This is the OQ-5 behaviour: **"Mark vacant" ends the mark covering today only; future marks are listed and removed one by one.**

**Mark vacant** (`today.state === 'occupied'`, `today.markId`): the row also has a visible `Button variant="outline" size="sm"` "Mark vacant" (+ sr-only " seat {label}"), same action as the current mark above. It opens `AlertDialog`: title "Mark seat {label} vacant?", description "The mark ends today. Renters can book it from the next slot that has not started.", buttons "Keep occupied" (**initial focus**) and "Mark vacant". Pending "Updating…" (both disabled, dialog not dismissable). Success: the dialog closes, `toast.success("Seat {label} is vacant")`, rows and marks update, and **focus returns to that row's "Mark vacant" button if it still exists, else to the row's "Occupancy" button, else to the first row's checkbox**. Failure: page Alert (focused) section 6. Removing an upcoming mark uses the same dialog with title "Remove this mark for seat {label}?", description "{range}. The seat stays bookable on those dates.", buttons "Keep mark" and "Remove mark", toast "Mark removed".

### 2.3 Selecting seats (keyboard multi-select, SC-007)

A new first control in each row: `Checkbox` with `aria-label="Select seat {label}"` (visible label is the seat label; the box is the control, `min-h-11` row target on mobile, unchecked border `border-muted-foreground` as 02 section 1). Row order inside a row (tab order): checkbox, today badge/note (not focusable), "Occupancy", "Mark vacant", "Edit", "Remove".

Above the list, in a toolbar `<div role="group" aria-label="Seat selection">` (`flex flex-wrap items-center gap-3`):

- `Checkbox` "Select all {n} seats" (`n` = seats in the list). Tri-state: checked when all are selected, `aria-checked="mixed"` (shown with a minus icon, not only a fill) when some are. Space toggles; selecting all with all selected clears.
- A status `<p role="status">` (polite, always present when a selection exists): "{n} seats selected" / "1 seat selected" / empty when none.
- `Button` "Mark occupied" (`LockIcon`), shown when at least one seat is selected (hidden, not disabled, with none; the toolbar stays), and `Button variant="ghost" size="sm"` "Clear selection".
- Selection persists across list refetches by seat id (a seat that disappears is dropped). It is cleared by a successful mark and by "Clear selection".

Keyboard: Tab to a checkbox, **Space** toggles it. **Shift+Space** on a checkbox selects the range from the last toggled seat to it (Shift+click does the same); this is an accelerator, "Select all" and per-seat toggling are always enough. No other key shortcut. The form path of every action (select, mark) is the plain checkbox plus button path; nothing is pointer-only.

### 2.4 Mark occupied panel

"Mark occupied" opens an inline `Card` (a panel, not a dialog) directly under the toolbar: h3 "Mark seats occupied" (`tabIndex={-1}`, **receives focus** on open). Form pattern 02 section 2.1, `noValidate`.

| #   | Control                   | Label                                                    | Notes and hint                                                                                                                                             |
| --- | ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | muted text                | "Seats: A-1, A-2, A-3"                                   | The selected labels, first 10, then "and {n} more". Not a field.                                                                                           |
| 2   | `Input type="date"`       | Start date                                               | prefilled with today in the space's zone; hint "Dates are in {zone}."                                                                                      |
| 3   | `fieldset` + `RadioGroup` | legend "Ends"                                            | "Until I mark them vacant" (value `open`, default) and "On a date" (value `date`)                                                                          |
| 4   | `Input type="date"`       | End date                                                 | only when "On a date" is chosen; hint "The seats stay occupied through this day." Revealing it keeps focus on the radio.                                   |
| 5   | `Textarea` (2 rows)       | Note (optional)                                          | hint "Only you can see this. Up to 200 characters." Counter text "{n} of 200" below, muted, updates on change (not live). Example placeholder is not used. |
| 6   | Buttons                   | "Mark occupied" (`Button`), "Cancel" (`variant="ghost"`) | Mark occupied pending: `Loader2Icon` "Marking…", `aria-busy`, all fields and Cancel disabled.                                                              |

Validation copy: "Choose a start date." · "Choose an end date." · "The end date can't be before the start date." (field error on End date). Errors follow 02 section 2.1; focus to the first invalid field.
Cancel closes the panel, keeps the selection, and returns focus to "Mark occupied". Opening again resets to defaults.

**Success (201):** the panel closes, `toast.success("{n} seats marked occupied")` ("1 seat marked occupied"), the selection is cleared, rows update, and focus moves to the h2 "Your seats" (`tabIndex={-1}`). A polite status line also announces "{n} seats marked occupied." so the outcome is not toast-only.

**Conflict refusals (409, nothing was created: all or nothing).** An `Alert variant="destructive"` (`role="alert"`, `tabIndex={-1}`, **focused**) inside the panel under the h3. The selection and field values are **kept** so the owner can adjust dates and retry.

| `type`                              | Alert title                          | Description                                                                                                                                             |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `occupancy:conflicts-with-bookings` | Some seats are booked on those dates | "Renters have booked these seats on the dates below, and you can't cancel a renter's booking. Choose other dates or other seats. No seats were marked." |
| `occupancy:already-occupied`        | Some seats are already occupied      | "You've already marked these seats occupied on the dates below. Choose other dates or other seats. No seats were marked."                               |

Then the **conflict list** (`<ul>` under the description, `text-sm`, from `conflicts`): one `<li>` per seat in the returned order, the seat label in `font-medium`, then up to two lines:

- "Booked: {dates}" from `bookedDates`, consecutive dates folded into ranges ("Tue 3 Nov to Fri 6 Nov, Mon 9 Nov"), at most 6 ranges, then "and {n} more days". Date-only, current-year format of 01 section 7 (no year when it is the current year).
- "Already occupied: {range}" for each entry of `marks`: "Mon 2 Nov to Fri 6 Nov" or "from Mon 2 Nov, no end date".
- At most 10 seats are listed, then "and {n} more seats". The list is a plain list, not interactive; the first affected seat's checkbox is **not** focused (focus stays on the Alert). The labels are the data, so no renter identity appears (README: neither extension carries renter identities).

When the response has both kinds of entries the title follows the `type` and both line kinds are shown. Other failures: section 6.

### 2.5 States (seats page additions)

| State    | Behaviour                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Rows with today badge, checkbox, actions; toolbar; no panel.                                                                                                                                                                                                                                                                                               |
| Hover    | Rows `bg-muted/50` (5.75 / 6.68); buttons and links per 01 2.4.                                                                                                                                                                                                                                                                                            |
| Focus    | 02 section 2.2 outlines. Tab order inside the page: Add one seat, Add many, cubicles (02 7.5), then the toolbar (Select all, Mark occupied, Clear selection), the panel when open, then each row (checkbox, Occupancy, Mark vacant, Edit, Remove).                                                                                                         |
| Disabled | The panel's fields and buttons while it submits; a row's buttons while its own request runs; the dialog buttons while pending. Checkboxes stay enabled during a mark so the selection is visible, but changes are ignored until it ends.                                                                                                                   |
| Loading  | Today badge `Skeleton h-6 w-24 rounded-4xl` per row while `today` or marks load (the row's other content shows). Occupancy buttons appear when marks arrive. Wrapper keeps 02's `aria-busy` and sr-only "Loading seats…".                                                                                                                                  |
| Empty    | No seats: 02 section 7.5 empty card; **no toolbar** (nothing to select). A seat with no marks: no "Occupancy" button.                                                                                                                                                                                                                                      |
| Error    | Seats list failure: 02 section 7.5. **Marks** failure only: rows keep the `today` badge from the seats response, and a single `Alert variant="destructive"` above the list "We couldn't load occupancy details" / "Try again in a moment." with "Try again"; "Occupancy" buttons are absent. Action failures: panel Alert (2.4) or page Alert (section 6). |
| Success  | Toasts plus a visible list update, focus as in 2.2 and 2.4.                                                                                                                                                                                                                                                                                                |

**Layout.** Mobile: toolbar wraps (`flex-wrap`), "Mark occupied" and "Clear selection" full width stacked, panel fields one column, buttons full width; row: checkbox and label on the first line, badge and note under it, buttons below in a wrapping row (`grid grid-cols-2 gap-2`). `md`: panel `max-w-2xl`, Start date and End date side by side (`grid-cols-2`). `lg`: row is one line (checkbox, label, cubicle, badge on the left, buttons right).

## 3. Availability page (T052)

`/owner/spaces/[spaceId]/availability`. h1 "Availability", muted "Choose when seats can be booked. One shared calendar applies to every seat unless a seat has its own." then "Dates are in {zone}." Data: `useOwnerOperationsListCalendars` (`SpaceCalendars`), `useOwnerSpacesListSeats` (to know which seats use the shared calendar), `…PutSharedCalendar`, `…PutSeatCalendar`, `…DeleteSeatCalendar`.

Sections in DOM and tab order: h2 "Shared calendar", h2 "Seats with their own calendar".

### 3.1 Calendar form (shared by the shared calendar and a seat's own)

`components/calendar-form.tsx`. `<form noValidate>`, RHF + `zodResolver` mirroring `CalendarInput`. Fields, in tab order:

| #   | Control                            | Label                                                | Notes and hint                                                                                                                          |
| --- | ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Input type="date"`                | Start date                                           | no `min`. Hint "The first day seats can be booked."                                                                                     |
| 2   | `fieldset` + `RadioGroup`          | legend "Ends"                                        | "No end date" (default for a calendar with `endDate: null`) and "On a date"                                                             |
| 3   | `Input type="date"`                | End date                                             | only for "On a date"; hint "The last day seats can be booked." Same reveal rule as 2.4 row 4. Sends `endDate: null` when "No end date". |
| 4   | `fieldset` + 7 weekday chips (3.2) | legend "Days of the week"                            | hint "Seats can be booked only on the days you choose."; three link-style presets after the chips (3.2)                                 |
| 5   | Buttons                            | "Save calendar" / "Save shared calendar" per context | pending "Saving…" (all fields disabled, `aria-busy`)                                                                                    |

Validation (field errors, 02 section 2.1): "Choose a start date." · "Choose an end date." · "The end date can't be before the start date." (on End date) · "Choose at least one day." (on the weekday fieldset, `aria-describedby`, focus to the first chip). Save is never disabled for validation.
Nothing changed and Save pressed: show "Calendar saved" without a request (as 02 section 4.1).

### 3.2 Weekday toggles (not colour alone)

A `fieldset` with `legend` "Days of the week" containing a `<div class="flex flex-wrap gap-2">` of seven `Label` chips in Monday-first order. Each chip is a visually hidden `Checkbox`/`input type="checkbox"` (`peer`, `sr-only`) inside a `Label` showing the short name "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun". The input has `aria-label` with the **full** name ("Monday"), which contains the visible text (label in name).

| State    | Chip style (tokens only)                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Off      | `rounded-lg border border-muted-foreground bg-card text-foreground`, no icon                                                                                                               |
| On       | `rounded-lg border border-primary bg-primary text-primary-foreground` **plus** `CheckIcon` before the name (7.37 / 7.88). Fill and icon both change, so on/off is readable without colour. |
| Hover    | off: `bg-muted/50`; on: `bg-primary/90`                                                                                                                                                    |
| Focus    | `peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring`                                                                                         |
| Disabled | `opacity-50` while saving                                                                                                                                                                  |

Chip size `min-h-11 min-w-14` (44 px). Presets, `Button variant="link" size="sm"` after the chips: "Every day", "Weekdays", "Weekends". They set the toggles (do not submit) and announce nothing extra (the checkbox states change). Space toggles a chip, Tab moves between chips (seven tab stops; it is a normal checkbox group, not a roving grid).
Summary text used elsewhere (read-only): all seven "Every day"; Monday to Friday "Mon to Fri"; Saturday and Sunday "Sat and Sun"; otherwise the short names joined with ", " ("Mon, Wed, Sat").

### 3.3 Shared calendar section

`Card`, h2 "Shared calendar", muted "Applies to every seat that doesn't have its own calendar." then the 3.1 form prefilled from `shared`. Defaults of a new space (AC 6.1): starts on the creation date, no end date, every day.

**Save outcome.** `PUT` returns `CalendarChange` with `bookingsOutsideCalendar`. Next to the button, a persistent `<p role="status">` (as 02 section 2.3, removed when any field changes again):

- `CircleCheckIcon` (`text-success`) "Calendar saved" when the count is 0.
- When the count is greater than 0, the same line is followed by an `Alert` (default variant, `InfoIcon`, `role="status"`, **not** focused, kept until the next change or save): title "{n} bookings fall outside the new calendar" ("1 booking falls outside the new calendar"), description "They stay valid. Renters keep those days, and no booking was cancelled." with link "View bookings" to `/owner/spaces/{id}/bookings`. FR-025, AC 6.5. This is information, so it is not a destructive Alert and does not steal focus; the polite status is read out.

### 3.4 Seats with their own calendar

h2 "Seats with their own calendar". Muted "These seats ignore the shared calendar."

**List** `<ul aria-label="Seats with their own calendar">`, `divide-y rounded-xl border bg-card`, one `<li>` per entry of `seats` (by label): seat label (`font-medium`), muted summary "From {start date}, no end date, {weekday summary}" / "{start date} to {end date}, {weekday summary}", and actions `Button variant="outline" size="sm"` "Edit calendar" and "Use shared calendar" (each with sr-only " for seat {label}"). Mobile: label and summary stacked, buttons below in `grid grid-cols-2 gap-2`; `sm` and up one row.

- **Edit calendar** swaps the row for an inline 3.1 form (prefilled) with "Save calendar" and "Cancel"; focus goes to Start date; Cancel or a successful save returns focus to that row's "Edit calendar".
- **Use shared calendar** opens `AlertDialog`: title "Use the shared calendar for seat {label}?", description "The seat's own calendar is removed and the shared calendar applies. Bookings that already exist stay valid.", buttons "Keep own calendar" (**initial focus**) and "Use shared calendar". Pending "Switching…". Success: toast "Seat {label} uses the shared calendar", the row leaves the list, the same **outside-the-calendar notice** as 3.3 appears in the section's status region (`role="status"`, persistent), and focus moves to the "Give a seat its own calendar" Seat select (or the section h2 if no seats remain on the shared calendar).

**Add** `Card`, h3 "Give a seat its own calendar": `NativeSelect` "Seat" (first option "Choose a seat", then seats whose `calendar` is `shared`, by label; hint "The seat leaves the shared calendar." ), `Button variant="outline"` "Set up calendar". It reveals the 3.1 form below, prefilled with the **shared** calendar's values, with buttons "Save seat calendar" and "Cancel"; focus goes to Start date; Cancel returns focus to the Seat select. Choosing no seat: field error "Choose a seat." Success: toast "Seat {label} has its own calendar", the form closes, the seat appears in the list, the outside-the-calendar notice shows if the count is above 0, and focus moves to that seat's "Edit calendar" button.
If every seat already has its own calendar the select is replaced by muted text "Every seat has its own calendar." If the space has no seats: muted "Add seats first." with link "Go to seats".

### 3.5 States (availability page)

| State    | Behaviour                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Shared form prefilled; own-calendar list; Add card.                                                                                                                                                                                                                    |
| Hover    | Buttons and links 01 2.4; chips 3.2; rows `bg-muted/50`.                                                                                                                                                                                                               |
| Focus    | 02 section 2.2. Tab order: main nav, sub-nav, shared form (Start date, Ends radios, End date, seven chips, presets, Save), own-calendar rows (Edit calendar, Use shared calendar), Add card (Seat, Set up calendar).                                                   |
| Disabled | A form's fields and button while it saves; a row's buttons while its request runs; a dialog's buttons while pending.                                                                                                                                                   |
| Loading  | h1 and intro at once; shared Card `Skeleton h-72 rounded-xl`; list `Skeleton h-14` x 2; wrapper `aria-busy`, sr-only polite "Loading availability…". The Add card renders when seats load.                                                                             |
| Empty    | No seat has its own calendar: muted "No seats have their own calendar. The shared calendar applies to all of them." (the Add card stays).                                                                                                                              |
| Error    | Load failure: `Alert variant="destructive"` "We couldn't load availability" / "Try again in a moment." / "Try again" in place of the content. Save failures: section 6 (a validation problem lands on the field; anything else is an Alert inside that Card, focused). |
| Success  | "Calendar saved" status (3.3), toasts for list actions, plus the outside-calendar notice when the count is above 0.                                                                                                                                                    |

**Layout.** Mobile: one column, full-width buttons, chips wrap (two rows of 4 and 3). `md`: shared form `max-w-2xl`, Start date and End date side by side. `lg`: the shared Card and the own-calendar list stay one column (`max-w-3xl`); the Add card sits next to the list (`lg:grid-cols-2`).

## 4. Bookings page (T058)

`/owner/spaces/[spaceId]/bookings`. h1 "Bookings", muted "Upcoming bookings for this space. Renters pay you directly; BSeat doesn't record payments." then "Dates and times are in {zone}." Data: `useOwnerOperationsListBookings` (infinite, `cursor`).
The list holds active bookings that have not ended, soonest first; cancelled bookings never appear.

### 4.1 Date filter (`<form role="search" aria-label="Filter bookings" noValidate>`)

DOM order: `Input type="date"` "From (optional)", `Input type="date"` "To (optional)", `Button` "Filter", `Button variant="ghost"` "Clear dates" (only when a filter is applied). The filter is **dates a booking has an occurrence in** (contract): hint under the pair, muted "Shows bookings with a day in this range."
Validation: "To can't be before From." (field error on To, no request; the API's 400 is the backstop). Filters live in the URL (`?from=&to=`), so Back and reload work. Submitting resets paging (a new list). Pending: "Filter" shows "Filtering…", list `aria-busy`. Mobile: fields stacked, buttons full width; `sm`: From, To and the buttons on one row (`sm:grid-cols-[1fr_1fr_auto]`).
When a filter is applied, a muted line under the form states it in text: "Showing bookings from {From} to {To}." / "…from {From}." / "…until {To}."

### 4.2 Booking item

`<ul aria-label="Bookings">` of `Card p-4 grid gap-2` (`<li>`). Each item:

- h2 `text-base font-medium`: the renter's name (`break-words`), `tabIndex={-1}`.
- `<dl>` (labels `text-muted-foreground text-sm`, one column below `md`, `md:grid-cols-3` `gap-x-6 gap-y-2`): "Email" (a link `mailto:{email}`, `text-primary underline-offset-4 hover:underline`, `break-all`), "Seat" ("{label}"), "Pass" ("{Pass name} · {slot name}"), "Period" ("Tue 3 Nov to Mon 9 Nov 2026", a day pass shows one date), "First slot" ("{firstStartsAt}", section 2.4 format with zone), "Ends" ("{lastEndsAt}"), "Price" ("₹3,000.00", `font-medium`).
- Nothing in the item is a button. No cancel, no edit (owners cannot cancel or move bookings).
- The renter's email is personal data shown only to the space's owner; no logging, no copy buttons.

| State    | Behaviour                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Filter form, applied-filter line, items in API order.                                                                                                                                                                                                                                                                                                               |
| Hover    | The email link underlines; items do not change.                                                                                                                                                                                                                                                                                                                     |
| Focus    | Tab order: main nav, sub-nav, From, To, Filter, Clear dates, then each item's email link, then "Show more bookings". The h2 is not a stop.                                                                                                                                                                                                                          |
| Disabled | "Filter" and the fields while a **new** list loads; "Show more bookings" while it loads. Not used to hide a reason.                                                                                                                                                                                                                                                 |
| Loading  | Form renders at once; `Skeleton h-28 rounded-xl` x 4, list `aria-busy`, sr-only polite "Loading bookings…".                                                                                                                                                                                                                                                         |
| Empty    | No filter: `Card` "No upcoming bookings yet." muted "Bookings appear here when renters book a seat." Filter applied: "No bookings in that date range." muted "Try different dates." `Button variant="outline"` "Clear dates".                                                                                                                                       |
| Error    | `Alert variant="destructive"` "We couldn't load bookings" / "Try again in a moment." / "Try again". 400 from the API (`to` before `from`): title "Check the dates" / "To can't be before From." 400 for a bad cursor: title "We couldn't load more bookings" / "The list changed. Start again from the first page." with `Button` "Reload list" (drops the cursor). |
| Success  | Items plus the applied-filter line. The status line (below) announces the count.                                                                                                                                                                                                                                                                                    |

**Count and paging (architect T001: `nextCursor`, `limit` 1 to 100, default 50).** A status `<p role="status">` under the filter line: "Showing {n} bookings" / "Showing 1 booking" (the total is unknown while `nextCursor` is set, so it says "Showing"; with `nextCursor` null it reads "{n} bookings"). Below the list, when `nextCursor` is not null: `Button variant="outline"` "Show more bookings" (pending "Loading…" and disabled). On success the new items are appended, **focus moves to the first new item's h2**, and the status line updates. Failure: `Alert` (focused) under the list "We couldn't load more bookings" / "Try again in a moment." with "Try again"; loaded items stay. A new filter replaces the list and does not move focus.

**Layout.** Mobile: items stacked, dl one column. `md`: dl three columns per item. `lg`: items still one per row, `max-w-6xl`.

## 5. Keyboard and focus summary

| Flow                         | Keyboard path (no pointer)                                                                     | Focus after                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Select seats                 | Tab to a row checkbox, Space; or "Select all"; Shift+Space for a range                         | stays on the control; status announces the count  |
| Mark occupied                | Toolbar "Mark occupied", fill the panel, "Mark occupied"                                       | h2 "Your seats" on success; the Alert on conflict |
| Mark vacant or remove a mark | "Mark vacant" or "Occupancy" then the mark's button, dialog (initial focus on the safe button) | per 2.2                                           |
| Set a calendar               | Tab through the fields and chips (Space toggles), "Save calendar"                              | stays on Save; status line "Calendar saved"       |
| Seat's own calendar          | Seat select, "Set up calendar", form; or "Edit calendar" / "Use shared calendar" on a row      | per 3.4                                           |
| Filter bookings              | From, To, "Filter"                                                                             | stays on Filter                                   |
| Page more bookings           | "Show more bookings"                                                                           | first new booking's h2                            |

Every dialog is `AlertDialog` (focus trapped, Escape closes unless pending, returns focus to its trigger when closed without an action). Every Alert that needs action is `role="alert"`, `tabIndex={-1}` and focused; the informational "outside the calendar" notice is `role="status"` and not focused. Toasts are never the only record.

## 6. Problem copy (`lib/marketplace-problems.ts`, as 01 section 7)

Web titles and descriptions are shown; the API `title` and `detail` never are. `{type}` is after `urn:bseat:problem:`.

| `type` (status)                           | Action                     | Shown as                       | Title                                | Description                                                                                                                         |
| ----------------------------------------- | -------------------------- | ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `occupancy:conflicts-with-bookings` (409) | mark occupied              | Alert in panel + conflict list | Some seats are booked on those dates | 2.4 text                                                                                                                            |
| `occupancy:already-occupied` (409)        | mark occupied              | Alert in panel + conflict list | Some seats are already occupied      | 2.4 text                                                                                                                            |
| `http-404`                                | mark occupied              | Alert in panel                 | We couldn't find one of those seats  | "A seat may have been removed. The list is up to date. Select the seats again and try once more." (refetch seats, drop missing ids) |
| `http-404`                                | mark vacant or remove mark | page Alert                     | We couldn't find that mark           | "It may already have ended. The list is up to date."                                                                                |
| `validation` (400)                        | mark occupied              | field errors, else panel Alert | Check the details                    | "Check the details and try again." (a field-mapped path lands on the field; messages from 2.4)                                      |
| `validation` (400)                        | save calendar              | field errors, else form Alert  | Check the details                    | "Check the details and try again."                                                                                                  |
| `http-404`                                | calendar save or switch    | Alert in the Card or section   | We couldn't find that seat           | "It may have been removed. The list is up to date."                                                                                 |
| `validation` (400)                        | list bookings              | Alert                          | Check the dates                      | "To can't be before From."                                                                                                          |
| `http-403`                                | any action                 | page Alert                     | Not allowed                          | "You don't have access to this." (the owner gate normally prevents it)                                                              |
| `http-404`                                | space load                 | `[spaceId]` layout 404 (02 5)  | We couldn't find that space          | "Check the address, or go back to your dashboard."                                                                                  |

**Fallbacks** by status for an unmapped type: 400 and 422 "Check the details and try again."; 401 title "Your session has ended" with "Sign in again to continue." and a "Sign in" link (`safeNext`); 403 "You don't have access to this."; 404 "We couldn't find that. It may have been removed."; 409 "That changed while you were working. Reload and try again."; network "Check your connection and try again."; 5xx "Something went wrong on our side. Try again in a moment."
Fallback titles are "We couldn't {action}": "mark those seats occupied", "mark that seat vacant", "remove that mark", "save the calendar", "switch that seat's calendar", "load bookings", "load more bookings", "load availability", "load occupancy details". A 409 with an unmapped type on a calendar or a mark has the retry "Reload" (refetch) in the Alert.

## 7. Contrast and accessibility notes

- Pairs (all from tokens.md, no new pair): `foreground` and `muted-foreground` on `background`, `card`, `muted/50` (6.00 and up); `secondary-foreground` on `secondary` for badges (16.42 / 14.48); `primary-foreground` on `primary` for "on" chips and main buttons (7.37 / 7.88; hover `primary/90` is above the `primary/80` 4.56 / 5.33 measured in tokens.md); `destructive` on `card` for Alerts and errors (5.43 / 6.15); `success` on `card` for "Calendar saved" (5.65 / 7.67); `primary` on `background` and `card` for links (7.69 / 7.13). Off chips and checkboxes use `border-muted-foreground` (6.00 / 7.98); focus outline 7.69 / 7.13.
- No colour-only meaning: today state is icon plus word; chips change fill **and** show a check; "Current" and "Upcoming" marks are words; the tri-state "Select all" shows a minus; the conflict list names seats and dates in text.
- Headings: seats page keeps h1, h2, h3 (02 section 10), the panel is h3 under "Your seats"; availability h1, h2 per section, h3 for Add; bookings h1 and h2 per booking.
- One `<main id="main">` and one `<h1>` per page; each button name contains its visible text plus the sr-only seat or space suffix, and is unique on the page.
- Reduced motion: no animation beyond shadcn defaults and the spinner.
- Dark theme: same classes; the second number in each pair is the dark value.
- qa (T049, T053, T059): axe on the seats page (rows with each today state, with a selection and the panel open, the conflict Alert, a vacant dialog, marks expanded), availability (default, with the outside-calendar notice, inline edit, Add form, switch-back dialog, loading, error), bookings (list, filtered, empty, empty with filter, error, 2 pages). Screenshots at 375, 768 and 1280 px, light and dark. Keyboard-only runs: mark two seats occupied then vacant; set a Monday to Friday shared calendar and a Saturday-only seat calendar; filter bookings by date.

## 8. Decisions and open questions

None blocks the frontend tasks. Each interim is the designer's choice; a human or architect may override it.

| Id       | Question                                                                                                                                                                                                                               | Interim used here                                                               | Affects    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| OQ-T46-1 | OQ-5 is accepted ("Mark vacant" ends today's mark; future marks are removed one by one). Is the same `POST …/occupancy/{markId}/end` the way to remove an upcoming mark? R-11 says `active = false` if not started, which implies yes. | Yes: "Mark vacant" and "Remove" both call `…/end` (2.2). Confirm with T047.     | T047, T048 |
| OQ-T46-2 | The seats response has `today.state` only. Should the page show a seat's next booking or next mark without opening "Occupancy"?                                                                                                        | No. Only today's state, with a link to Bookings for a renter-booked seat (2.1). | T048       |
| OQ-T46-3 | Shift+Space range selection and "Select all" are designer additions to meet "multi-select" (SC-007). Not in the spec.                                                                                                                  | Included as accelerators; per-seat checkboxes alone are sufficient (2.3).       | T048       |
| OQ-T46-4 | Can the shared or a seat calendar start in the past, or leave a gap before today? The contract has no minimum.                                                                                                                         | No `min` on the start date; the API decides (3.1).                              | T052       |
| OQ-T46-5 | The occupancy end date is shown as inclusive ("stay occupied through this day"), which matches R-11 (day boundary after the end date).                                                                                                 | Inclusive wording (2.4).                                                        | T048       |
| OQ-T46-6 | Owner bookings show the renter's email as a `mailto:` link. Owners cannot message renters in-app (spec), so this is the only way to reach them for offline payment.                                                                    | A plain `mailto:` link, no copy button (4.2).                                   | T058       |
| OQ-T46-7 | The bookings filter matches bookings with a day inside the range (contract), not bookings that start inside it. The hint says so.                                                                                                      | Hint "Shows bookings with a day in this range." (4.1)                           | T058       |

## Handoff note for frontend-dev

T048 (section 2) extends the seats page of T024 and needs the calendar badge field `OwnerSeat.calendar` from T051 only for the "Own calendar" label; T052 (section 3) and T058 (section 4) are new routes, each adding its own sub-nav link. `lib/marketplace-problems.ts` gets the section 6 rows; the weekday summary and the date-range folding helpers go in `lib/format.ts` with tests.
