# UI 03: Find a space, listing page, booking and my bookings

**Task**: T029 · **Used by**: T031 (listing page), T039 (find page), T040 and T041 (seat availability, booking), T057 (my bookings, dashboard next booking), T042 and T044 (qa)
**Spec**: US4, US7 (renter side), AC 3.5, AC 4.1 to 4.9, AC 7.1, AC 7.2, FR-014 to FR-017, FR-019, FR-020, FR-021, FR-026, FR-028, FR-031 (consistency), FR-032, FR-033, SC-002, SC-004
**Contracts**: [listings.md](../contracts/listings.md), [bookings.md](../contracts/bookings.md), [accounts.md](../contracts/accounts.md) (`/api/reference`, `preferences`), [README problem types](../contracts/README.md#problem-types-introduced-by-this-feature)
**Inherits** [01-shell-accounts.md](01-shell-accounts.md): touch targets (section 1), page frame and link states (2.1, 2.4), copy, time and money conventions (7), contrast (8); and [02-owner-listing.md](02-owner-listing.md): field pattern (2.1), control states (2.2), alerts and live regions (2.3), formatting (2.4), money (8.3). Only differences are written here.

## 1. Components and build map

Reuse from `@bseat/ui`: Alert, AlertDialog, Badge, Button, Card, Checkbox, Input, Label, NativeSelect, RadioGroup, Skeleton, Sonner.
**No new shadcn component and no token change.** One custom widget is needed: the city and area suggestions combobox (3.3), built on `Input` and plain elements (ARIA 1.2 combobox pattern). `@bseat/ui` has no popover or command component and this spec does not add one.
Icons (lucide, always `aria-hidden` beside text): `SearchIcon`, `MapPinIcon`, `CircleCheckIcon`, `BanIcon`, `CalendarXIcon`, `CalendarIcon`, `PercentIcon`, `InfoIcon`, `ArrowLeftIcon`, `Loader2Icon`, `ChevronDownIcon`, `ListIcon`. If a name is missing in the pinned lucide version, use the nearest icon; the text carries the meaning.

| Screen                                   | Route                        | Task       |
| ---------------------------------------- | ---------------------------- | ---------- |
| 3. Find a space                          | `/find` (`/book` until T042) | T039       |
| 4. Listing page (details, passes, seats) | `/spaces/[spaceId]`          | T031, T040 |
| 5. Review and confirmation               | same page, dialog and card   | T041       |
| 6. My bookings                           | `/bookings`                  | T057       |
| 7. Dashboard "Next booking"              | `/dashboard` (renter)        | T057       |

Page frames: Find and listing use `max-w-6xl` (cards in a grid); My bookings uses the default `max-w-4xl`. Every page has one `<main id="main">` and one `<h1>`.
Mobile controls as 02 section 1: every Button and link `max-sm:min-h-11`, `Input` and `NativeSelect` `max-sm:h-11`, form buttons `max-sm:w-full`.

## 2. Shared patterns

### 2.1 Search state lives in the URL

Filters are search params so Back, reload and sharing work: `/find?country=IN&city=Pune&area=Baner&startDate=2026-11-03&pass=week&slot=day&utilities=wifi&utilities=parking`
(names and values are the `SearchListingsInput` fields; `utilities` repeats). The listing link carries the same params, so the listing page opens with the pass, slot and start date the renter
searched for, and its "Back to results" link (4.1) rebuilds `/find` with them. Empty params are omitted. Seat choice is **not** in the URL.
**Prefill (AC 4.1):** when `/find` opens with none of `country`, `city`, `area` in the URL, prefill them from `useMeGet().preferences` (null means empty) and run the search at once if a country is set.
A renter with no preferred country sees the "Choose a country" start state (3.5) and no request fires.

### 2.2 Seat and offer tiles

Same tile family as 001 ui.md and 02 section 2.2 (`rounded-lg border bg-card p-3`, `min-h-16`; mobile `min-h-16`, whole tile is the target).

| Tile              | Look                                                                                                                                                   | Text and icon (never colour alone)                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Seat free         | `border bg-card`; hover `bg-muted/50`; selected `border-primary bg-primary/5` plus a filled radio dot; focus `outline-2 outline-offset-2 outline-ring` | `CircleCheckIcon` + "Free" in `text-success`                          |
| Seat taken        | `border-dashed bg-muted`, no opacity on text, not focusable (disabled radio item)                                                                      | `BanIcon` + "Taken" in `text-muted-foreground`                        |
| Seat closed       | `border-dashed bg-muted`, same as taken, not focusable                                                                                                 | `CalendarXIcon` + "Closed on {start date}" in `text-muted-foreground` |
| Offer (pass+slot) | as a free seat tile, with the pass name, its length and the price                                                                                      | Selected adds the filled radio dot and `aria-checked`                 |

Taken and closed tiles are visually the same (dashed, muted) and are told apart **by their words**. Closed is not a kind of taken: closed means the seat's calendar does not run on the start date (AC 6.4).

### 2.3 Money, dates and time zones

As 01 section 7 and 02 section 8.3: `formatMoney` for every amount, "Day pass", "Weekly pass", "Monthly pass", slot names with times, dates in the **space's** zone with the zone label once per range. Every
screen that shows slot or booking times has one muted line "Times are in {IANA zone}." where the space is known (FR-033). Weekly and monthly passes always show their end date.
Pass lengths in text: "1 day", "7 days", "30 days".

### 2.4 Alerts, toasts and live regions

As 02 section 2.3. Action failures: `Alert variant="destructive"`, `role="alert"`, `tabIndex={-1}`, **focused** on appearance, copy from section 8. Load failures: Alert with "Try again" (refetch).
Outcomes that must persist (booking confirmed) are a Card, not a toast. Toasts only for "Booking cancelled". Loading wrappers `aria-busy="true"` with an sr-only polite line.

## 3. Find a space (T039)

`/find`. h1 "Find a space", muted "Search by location. Choose a country to start." Replaces the 001 `/book` page; the nav link switches per 01 section 2.2.

### 3.1 Filters (`<form role="search" aria-label="Find a space" noValidate>`)

Field pattern 02 section 2.1. DOM order is tab order.

| #   | Control                              | Label                                                      | Notes and hint                                                                                                                                          |
| --- | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `NativeSelect`                       | Country                                                    | first option "Choose a country" (empty value), then `/api/reference` countries by name. Required: the only required field.                              |
| 2   | Combobox (3.3), `autoComplete="off"` | City (optional)                                            | max 100. Suggestions from `GET /api/listings/locations` (`field: city`).                                                                                |
| 3   | Combobox (3.3)                       | Area (optional)                                            | max 100. Hint "Suggestions appear after you enter a city." Suggestions need a city (`field: area` requires `city`).                                     |
| 4   | `Input type="date"`                  | Start date (optional)                                      | hint "Show only spaces with a free seat for the whole pass." `min` today in the **viewer's** zone, `max` +30 days (the space's zone is not known here). |
| 5   | `NativeSelect`                       | Pass (optional)                                            | "Any pass", "Day pass", "Weekly pass", "Monthly pass"                                                                                                   |
| 6   | `NativeSelect`                       | Slot (optional)                                            | "Any slot", "Day slot", "Night slot", "24-hour slot", "Working hours"                                                                                   |
| 7   | `fieldset` + `Checkbox` x 11         | legend "Utilities (optional)"                              | standard utilities, labels from 02 section 2.4; hint "Spaces must have all you tick."                                                                   |
| 8   | Buttons                              | "Search" (`SearchIcon`), `variant="ghost"` "Clear filters" | Clear resets the form to empty (not to preferences), focus to Country, no request until Search.                                                         |

- Search is never disabled for validation. Submitting without a country: field error under Country "Choose a country." (focus to Country, no request).
- The start date error "Choose a date from {today} to {today + 30 days}." (date-only format, section 2.3 of 02) is shown if the value is outside `min` to `max`. The server applies the booking rules on `POST`, not here.
- Changing a filter does **not** re-run the search; only "Search" (or Enter in a text field) does. Results never move under the user.
- Pending: "Search" shows `Loader2Icon` and "Searching…", `aria-busy`; the form stays editable (a new submit cancels the old request).
- **Below `md`:** Country, City, Area, then a disclosure `Button variant="outline"` "More filters" (`aria-expanded`, `aria-controls="more-filters"`, text "More filters (2)" with the count of non-empty
  Start date, Pass, Slot and ticked utilities; `ChevronDownIcon` rotates) wrapping fields 4 to 7, then the buttons. Closed on first render, toggling moves no focus. A filter that is set stays in the count
  even when closed. From `md` the disclosure button is `hidden` and fields 4 to 7 are always shown (CSS only, so the button leaves the accessibility tree at that width).
- Layout: mobile single column. `md`: Country, City, Area in `grid-cols-3`; Start date, Pass, Slot in `grid-cols-3`; utilities `grid-cols-3` of checkboxes (each `min-h-11` row on mobile). `lg`: same, buttons in one row.

### 3.2 Reference and preference edge cases

| Case                            | Behaviour                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference loading               | Country `disabled` with one option "Loading…", `aria-busy`; other fields work; no auto search yet                                                 |
| Reference failed                | Under Country: "We couldn't load the country list." and `Button variant="link" size="sm"` "Try again". Search then shows the Country error.       |
| Preferences loading             | Fields empty, no auto search; when they arrive and the URL has no location params, fill them and search. Never overwrite what the user has typed. |
| Stored country not in reference | Treated as empty (Choose a country)                                                                                                               |

### 3.3 City and area suggestions combobox (accessible)

`components/location-combobox.tsx`. ARIA 1.2 editable combobox with list autocomplete. The text stays free: a value that is not in the list is valid, and a failed suggestions request never blocks typing.

| Part          | Spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input         | `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls="{id}-listbox"`, `aria-activedescendant` (the active option id, empty when none), `aria-describedby` hint. A visible `Label` as 3.1. Keeps DOM focus the whole time.                                                                                                                                                                                                                                                              |
| Popup         | `ul role="listbox" id="{id}-listbox" aria-label="{City or Area} suggestions"`, under the input, `absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-md`. Rendered only when open and there is at least one option.                                                                                                                                                                                                                                     |
| Option        | `li role="option" id="{id}-opt-{n}" aria-selected` (true on the active one). Text `{value}` and muted `{count} spaces` ("1 space"). `min-h-11` on mobile, `px-3 py-2`.                                                                                                                                                                                                                                                                                                                                           |
| Active option | `bg-accent text-accent-foreground` **plus** `outline-2 -outline-offset-2 outline-ring`, so it is not shown by a fill that is only 1.1:1 against `popover`. Hover sets the active option too.                                                                                                                                                                                                                                                                                                                     |
| Requests      | After 250 ms idle with 1 to 100 characters typed. Area only when City is not empty. The latest request wins. Matching is the API's (prefix on trimmed, lower-cased text; AC 4.2). At most 10 options. Counts show only the space count.                                                                                                                                                                                                                                                                          |
| Keys          | **Down** opens the popup (if options) and moves to the next option (wraps); **Up** the previous; **Home/End** move the text caret as usual (the active option does not change). **Enter** with an active option picks it, closes the popup and keeps focus (the form is **not** submitted); **Enter** with none submits the form. **Escape** closes the popup (and keeps the text); with the popup already closed it does nothing. **Tab** closes and moves on without picking. Typing resets the active option. |
| Picking       | Replaces the field text with the option's `value`, closes the popup, keeps focus. Changing City never clears Area automatically (the user may keep or edit it).                                                                                                                                                                                                                                                                                                                                                  |
| Announcements | One sr-only `role="status"` (`aria-live="polite"`) line next to the input: "{n} suggestions available. Use the up and down keys." / "1 suggestion available." / "No suggestions." Updated when the result set changes, not on every keystroke. While loading: no announcement (avoids noise).                                                                                                                                                                                                                    |
| Pending       | A small `Loader2Icon` at the right end of the input (`aria-hidden`); nothing is announced.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Error         | The popup stays closed. Nothing is announced and no Alert is shown. The field is fully usable as plain text (the hint stays).                                                                                                                                                                                                                                                                                                                                                                                    |
| Disabled      | not used. The field is never disabled (Area without a city is allowed, it just has no suggestions).                                                                                                                                                                                                                                                                                                                                                                                                              |
| Touch         | Options `min-h-11`; tapping picks. The popup closes on outside pointer down.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Contrast: option text `popover-foreground` on `popover` (19.79 / 17.16 as `card`); muted count `muted-foreground` on `popover` (6.00 / 7.22). Outline 7.69 / 7.13.

### 3.4 Results

Under the form, `<section aria-labelledby="results-heading">`: h2 "Results" (sr-only until a search ran, then visible `text-lg font-medium`), then a status line `<p role="status">` (muted, always present once a search ran).
Status text: "{n} spaces in {City}, {Country name}" / "{n} spaces in {Country name}" / "1 space in …" (n is the loaded count; with `nextCursor` it reads "Showing {n} spaces", because the total is unknown). Filters that apply are listed once in muted text below: "Pass: Weekly pass · Slot: Day slot · Starting Tue 3 Nov 2026 · With Wi-Fi, Parking".

**Result card** (`<li>` of `<ul aria-label="Spaces">`, `Card`, `p-4`, `grid gap-2`):

- h3 `text-base font-medium` containing the link to `/spaces/{id}?{search params}` (name is the link text, `text-primary underline-offset-4 hover:underline`; focus as 01 2.4). One tab stop per card. The whole card is not a link.
- Muted "{area}, {city}" with `MapPinIcon`.
- Utilities: `<ul aria-label="Utilities">` of `Badge variant="outline"` (standard labels, then `customUtilities`), at most 5 shown, then muted text "+{n} more". Empty: nothing.
- Prices: `<p>` "From" then up to three items separated by " · ": "{price} per day pass", "{price} per weekly pass", "{price} per monthly pass" (a `null` price is left out; `font-medium` on the amounts). Currency from `currency` via `formatMoney`.
- If `hasLayout`: `Badge variant="secondary"` "Floor plan".
- Hover: `bg-muted/50`. Focus: on the link. No selected state.

| State    | Behaviour                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Status line, filters line, cards in API order (name A to Z). Grid: 1 column below `md`, `md:grid-cols-2`, `lg:grid-cols-3`, `gap-4`.                                                                                                                                                        |
| Hover    | Card `bg-muted/50` (5.75 / 6.68 for `muted-foreground`); link underlines.                                                                                                                                                                                                                   |
| Focus    | Link outline `outline-2 outline-offset-2 outline-ring` (7.69 / 7.13). Tab order: filters, Search, Clear filters, then each card link, then "Show more spaces".                                                                                                                              |
| Disabled | Search shows "Searching…" and `aria-busy` while a request runs; cards are dimmed `opacity-50` with `aria-busy` on the list while a **new** search replaces them. "Show more spaces" is disabled while it loads. No other disabled controls.                                                 |
| Loading  | First search: `Skeleton h-40 rounded-xl` x 3 in the grid, list `aria-busy="true"`, sr-only polite "Searching…". The status line is empty until done.                                                                                                                                        |
| Empty    | See 3.6.                                                                                                                                                                                                                                                                                    |
| Error    | `Alert variant="destructive"` in place of the list, title "We couldn't load spaces", description "Try again in a moment.", `Button variant="outline" size="sm"` "Try again" (refetch). Fallbacks per section 8 (401 sign-in link, 400 "Check your search", network). The form stays usable. |
| Success  | The cards and the status line. After a new search the status line announces the count; **focus stays where it was** (on Search). New results never steal focus.                                                                                                                             |

**Paging (OQ-12: 20 per page, cursor).** Below the list, when `nextCursor` is not null: `Button variant="outline"` "Show more spaces". Pending: "Loading…" with spinner, button disabled. On success the new cards are appended,
**focus moves to the first new card's link**, and the status line reads "Showing {n} spaces". Failure: an `Alert` (focused) under the list "We couldn't load more spaces" / "Try again in a moment." with "Try again"; the loaded cards stay. The button is not shown when `nextCursor` is null; the status line then drops "Showing".

### 3.5 Start state (no country yet)

Before any search: `Card` with `SearchIcon`, "Choose a country to see spaces." (`font-medium`), muted "Add a city or area to narrow the results.". No status line. This is also the state after "Clear filters".

### 3.6 Empty states

`items: []` and `nextCursor: null`. A `Card` in place of the list, `role="status"` is the status line already present; the card text is static.

| Filters in use                                  | Title (`font-medium`)                         | Description (muted)                                       | Action                                                                                                        |
| ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| City or area set (any other filters too)        | "No spaces match your search."                | "Try a different area, or look across the whole country." | `Button` "Search all of {Country name}" (clears city and area, **keeps** the other filters, re-runs, AC edge) |
| Only country plus date, pass, slot or utilities | "No spaces match your search."                | "Try fewer filters or a different start date."            | `Button variant="outline"` "Clear filters" (keeps the country)                                                |
| Country only                                    | "No spaces are listed in {Country name} yet." | "Check back later, or try another country."               | none                                                                                                          |

After "Search all of {Country name}" the status line announces the new result and focus stays on the pressed button if it remains, else moves to the h2 "Results" (`tabIndex={-1}`).

## 4. Listing page (T031, T040)

`/spaces/[spaceId]` (`app/(app)/spaces/[spaceId]/page.tsx`), `max-w-6xl`. Data: `useListingsGet` (details), `useListingsSeatAvailability` (seats, enabled only when pass, slot and start date are all set).
First element: `Button variant="link" size="sm" asChild` "Back to results" (`ArrowLeftIcon`) to `/find?{carried params}`; with no carried params the link reads "Find a space" and goes to `/find`.
Then h1 = the space name (`text-2xl font-semibold`, `break-words`), muted "{area}, {city}, {Country name}".

### 4.1 Structure and DOM order (this is the tab order)

1. Back link. 2. h1, location line. 3. **Details** (`section`, h2 "About this space"): description (`whitespace-pre-line`, `break-words`), `<dl>`: "Address" (`streetAddress`), "Hours" ("Open 24 hours" or "Working hours, 09:00 to 18:00", from `openingHours`), utilities as `Badge variant="outline"` list (`<ul aria-label="Utilities">`, standard labels then custom), "Floor plan" is not here (see 4.5). Muted "Times are in {timeZone}." No interactive controls, so no tab stops.
2. **Choose a pass** (`fieldset`/`RadioGroup`, 4.2). 5. **Start date** (4.3). 6. **Choose a seat** (4.4). 7. **Your selection** summary and "Review booking" (5.1).

Layout: below `lg` one column in that order. From `lg`: `lg:grid-cols-[1fr_20rem] gap-8`; the **Your selection** Card is the right column (`lg:sticky lg:top-4 lg:self-start`) but stays **last in the DOM**, so Tab order is unchanged.

### 4.2 Pass and slot options (`offers`)

One radio group, because the booking takes exactly one (pass, slot): `<div role="radiogroup" aria-labelledby="pass-heading">` under h2 "Choose a pass". Inside, one `role="group"` per offered slot, labelled by its heading text
"Day slot, 07:00 to 19:00" / "Night slot, 19:00 to 07:00 next day" / "24-hour slot, 07:00 to 07:00 next day" / "Working hours, 09:00 to 18:00" (from `offers[].slot` and times). Inside each group one tile per **priced** pass (a `null` price is not rendered):

- Pass name (`font-medium`): "Day pass", "Weekly pass", "Monthly pass"; muted "1 day", "7 days", "30 days".
- Price `font-medium`: "₹500.00".
- 24-hour tiles with a saving (`fullDaySavings[pass]` not null): below the price, `PercentIcon` and "Save ₹300.00 (17%) compared with day and night passes" in `text-success` (5.65 / 7.67 on `card`), text only, never a coloured badge.
- Tile selected: 2.2. Accessible name "{Pass name}, {slot name with times}, {price}" (the group label supplies the slot; give each radio `aria-label` the full string so it reads alone).
- Keyboard: the group is **one tab stop**; Arrow keys move between all tiles in DOM order and select as they go (radio behaviour); Space selects. Preselection: if a `pass` and `slot` are in the URL and offered, they are selected; **otherwise nothing is preselected** and the seat area shows 4.4 "choose" text. A space with a single offered tile still needs one press (no auto selection, to keep consent explicit).
- Layout: tiles in `grid gap-3` of 1 column below `sm`, `sm:grid-cols-3` (one group per row; a group holds up to 3 tiles).

| State   | Behaviour                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | h2 plus `Skeleton h-20 rounded-lg` x 3, wrapper `aria-busy`, sr-only polite "Loading passes…"                                                                                                     |
| Empty   | `offers` is empty: `Card` "This space isn't offering passes right now." muted "Check back later or find another space." `Button asChild` "Find a space". Date and seat sections are not rendered. |
| Error   | The listing load error (4.6) covers it; the section is not rendered                                                                                                                               |
| Success | tiles as above                                                                                                                                                                                    |

### 4.3 Start date

`Label` "Start date", `Input type="date"`, hint "Passes start on a day you choose, up to 30 days ahead. Dates are in {timeZone}." `min` = **today in the space's zone**, `max` = today + 30 days in that zone (computed with `Intl` in `timeZone`; the viewer's local date is wrong across zones).
Rendered once a pass is selected. Prefilled from the URL `startDate`; otherwise empty (nothing is assumed). Errors: "Choose a start date." (empty after trying to review) · "Choose a date from {min} to {max}." (outside the range; text formatted as the date-only helper with year).
The edge of the range can still be refused (`too-far-ahead` measures the first slot's start, section 8); the field does not try to predict it. Changing pass, slot or date clears the selected seat and refetches seats. The URL params are updated with `replace`.
Below the field, once seats have loaded: muted "{Pass name}: {start date} to {end date}." (date-only with year) from `startDate` and `endDate` of the response, for weekly and monthly passes only (day passes show the single date).

### 4.4 Seat list (`useListingsSeatAvailability`)

`<section aria-labelledby="seats-heading">`, h2 "Choose a seat". Rendered once pass, slot and a valid start date are set; before that, muted text "Choose a pass and a start date to see which seats are free." (static, not a status).

Under the h2, a status line `<p role="status">` muted: "{free} of {total} seats are free for this pass." Under it, `Checkbox` "Hide seats that aren't free" (unchecked by default; filters the grid client-side; if it leaves nothing, show "No free seats to show." muted).
Then `<div role="radiogroup" aria-labelledby="seats-heading">` of seat tiles in API order (label A to Z), `grid gap-3`: 2 columns below `sm`, `sm:grid-cols-3`, `lg:grid-cols-4` (in the listing's left column from `lg`: `grid-cols-3`).

**Seat tile content** (2.2 for the look): label `font-medium` (`break-words`); muted cubicle name (when any); muted features joined by ", " (when any); then the state line.

| `status` | State line                                                                        | Extra lines (free only)                                                                                                                          |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `free`   | `CircleCheckIcon` "Free"                                                          | "Ends {lastEndsAt}" (section 2.3 format, with time and zone, AC 4.4). When `closedDates` is not empty: "Skips {n} closed days" ("1 closed day"). |
| `taken`  | `BanIcon` "Taken"                                                                 | none                                                                                                                                             |
| `closed` | `CalendarXIcon` "Closed on {start date}" (date-only, no year if the current year) | none                                                                                                                                             |

Accessible name of a radio: "{label}, {cubicle name, }{Free / Taken / Closed on {date}}". Taken and closed are `disabled` radio items: skipped by arrow keys, still read in browse mode (as 001). The group is one tab stop; Arrow keys move among free seats and select; Space selects.
Selecting a seat does **not** book. It fills the "Your selection" card (5.1) and announces "Seat {label} selected." through a separate sr-only `role="status"` line, so the visible count line is unchanged.

| State    | Behaviour                                                                                                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Count line, filter checkbox, tiles. Nothing selected.                                                                                                                                                                                                                                                                             |
| Hover    | Free tile `bg-muted/50`. Taken and closed: no change.                                                                                                                                                                                                                                                                             |
| Focus    | Outline on the checked or focused free tile; Tab order: pass group, date, hide checkbox, seat group, then "Review booking".                                                                                                                                                                                                       |
| Disabled | Taken and closed tiles (see above; not dimmed). The whole group while the booking request runs.                                                                                                                                                                                                                                   |
| Loading  | `Skeleton h-24 rounded-lg` x 6, group `aria-busy="true"`, sr-only polite "Loading seats…". On a refetch after a changed filter the old tiles stay at `opacity-50` with `aria-busy` until the new ones arrive (no layout jump), and the selection is already cleared.                                                              |
| Empty    | **No seat free for the whole period** (AC edge): seats exist but none is `free`: `Card` above the tiles, `font-medium` "No seat is free for the whole period.", muted "Try another start date, pass or slot." The tiles still show (all taken or closed). No seats at all: "This space has no seats right now." and nothing else. |
| Error    | `Alert variant="destructive"` in place of the tiles: title "We couldn't load seats", description "Try again in a moment.", "Try again" (refetch). `booking-rule:pass-not-offered` (422): title "That pass isn't offered", description "Choose another pass or slot." and the listing is refetched (4.2 may change). 404: as 4.6.  |
| Success  | tiles plus a selection. If a refetch makes the selected seat not free, the selection is cleared and the status reads "Seat {label} is no longer free. Choose another seat."                                                                                                                                                       |

### 4.5 Plan view hook (T061)

When `hasLayout` is true, T061 (ui/05, section 8) adds a "Plan" / "List" switch above the seat group. This spec's seat list is the **List** view and stays reachable at all sizes. When `hasLayout` is false, nothing changes here (AC 8.5).

### 4.6 Page states

| State     | Behaviour                                                                                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading   | Back link, h1 sr-only "Loading", `Skeleton h-8 w-64`, `Skeleton h-24` (details), `Skeleton h-20` x 3; wrapper `aria-busy`, sr-only polite "Loading this space…"                                                                                                                                                       |
| 404       | `main` with h1 "We couldn't find that space", muted "It may have been unlisted.", `Button asChild` "Find a space". (Draft, unpublished and random ids look the same, ADR-0010.)                                                                                                                                       |
| Error     | h1 "Space", `Alert variant="destructive"` "We couldn't load this space", "Try again in a moment.", "Try again". 401 per 01 section 2.5.                                                                                                                                                                               |
| Own space | `isOwnSpace` true: details shown; **no** pass, date, seat or booking sections. `Alert` (default variant, `InfoIcon`, `role="status"`, not focused) title "This is your space", description "You can't book a seat in it. To block seats, mark them occupied." with link "Manage seats" to `/owner/spaces/{id}/seats`. |
| Success   | Sections 4.1 to 4.4.                                                                                                                                                                                                                                                                                                  |

Breakpoints: mobile single column, details first, tiles stacked; `sm` 3-column offer tiles; `md` seat tiles 3 per row; `lg` two columns with the sticky selection card, seat tiles 3 per row in the left column.

## 5. Booking: review, confirmation (T041)

### 5.1 "Your selection" card (`Card`, `section aria-labelledby="selection-heading"`, h2 "Your selection")

| State              | Content                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing chosen     | muted "Choose a pass, a start date and a seat." `Button` "Review booking" is always shown and enabled: pressing it without a complete choice shows an error line (`text-destructive text-sm`, tied with `aria-describedby`) next to the first missing piece ("Choose a pass." / "Choose a start date." / "Choose a seat.") and moves focus to that control. Never disabled for validation (02 2.2). |
| Seat chosen        | `<dl>`: Space (name), Seat ("{label}" plus cubicle), Pass ("{Pass name} · {slot name}, {times}"), Starts ("{firstStartsAt}"), Ends ("{lastEndsAt}", labelled with the zone once), Price ("₹3,000.00", `font-medium`). Muted "You'll pay the owner directly. BSeat doesn't take payments." `Button` "Review booking".                                                                                |
| Disabled / pending | While a booking request runs the card's button reads "Booking…" with spinner, `aria-busy`, and the page controls above it are disabled.                                                                                                                                                                                                                                                             |

### 5.2 Review dialog (the confirmation step)

"Review booking" opens `AlertDialog` (Radix; focus trapped; Escape closes; background inert):

- Title "Confirm your booking".
- Description, a `<dl>` (all with the 5.1 values): Space, Seat, Pass and slot, "Starts", "Ends", for weekly and monthly passes "Closed days skipped" with the dates ("Sat 7 Nov, Sun 8 Nov", only when any; `closedDates` from the seat), and **Price**. Then the offline-payment note, `text-muted-foreground`: "You'll pay {price} directly to the owner. BSeat doesn't take payments." Then "Times are in {zone}."
- Buttons: `Button variant="outline"` "Change selection" (**initial focus**, safe default) and `Button` "Confirm booking".
- Because Radix closes an `AlertDialogAction` on click, "Confirm booking" calls `preventDefault`, and the dialog stays open and controlled while the request runs. Pending: "Booking…", `aria-busy`, spinner, both buttons disabled, Escape and outside click ignored.
- **Success (201):** the dialog closes, the page body replaces the pass, date, seat and selection sections with the confirmation card (5.3), focus moves to its h2. Invalidate seat availability, `useBookingsListMine` (all variants, so My bookings and the dashboard are fresh).
- **Failure:** the dialog closes. For every problem below the page-level Alert (section 8, focused) appears **above the pass section**, directly under the details, `role="alert"` `tabIndex={-1}`. Additionally: `seat-unavailable` and `user-overlap` refetch seats and clear the selection; `pass-not-offered` and `space-not-published` refetch the listing. The chosen pass and date stay as entered. The Alert is replaced, never stacked, and is removed when the user changes pass, date or seat.

### 5.3 Confirmation (success state)

`Card` (`role` none; it is a normal section) with `CircleCheckIcon` (`text-success`, `aria-hidden`) and h2 "Booking confirmed" (`tabIndex={-1}`, **receives focus**). Body `<dl>`: Space, Seat, Pass and slot, Starts, Ends, Price (all as 5.1, from the `Booking` response, not the selection). Then:

- Static text: "Pay {price} directly to the owner. BSeat doesn't take payments." (`font-medium` price, FR-021)
- Muted: "We're sending the details to {email}." (the signed-in user's email from `useMeGet`).
- Buttons: `Button asChild` "View my bookings" (`/bookings`) and `Button variant="outline" asChild` "Find another space" (`/find`).

The confirmation stays until the user navigates away. Reload shows the normal listing page (the booking is in My bookings). Contrast: `success` on `card` 5.65 / 7.67.

## 6. My bookings (T057)

`/bookings`. h1 "My bookings", muted "Bookings that haven't ended, soonest first." Data: `useBookingsListMine`; no paging (bounded by the overlap rule and the 30-day horizon).

**Booking card** (`<li>` of `<ul aria-label="Bookings">`, `Card p-4 grid gap-3`):

- h2 (`tabIndex={-1}`, `text-lg font-medium`): space name; muted "{area}, {city}".
- `Badge`: "Upcoming" (`variant="outline"`) when `firstStartsAt` is in the future, "In progress" (`variant="secondary"`) once started. The badge is text; it carries the cancel rule.
- `<dl>`: "Seat" ("{label}", plus ", {cubicle}" when set); "Pass" ("{Pass name} · {slot name}, {times}"); "Period" ("Tue 3 Nov to Mon 9 Nov 2026" date-only, weekly and monthly always; day pass one date); "First slot" ("{firstStartsAt}", section 2.3 with zone); "Ends" ("{lastEndsAt}"); when `skippedDates` is not empty "Closed days skipped" ("Sat 7 Nov, Sun 8 Nov"); "Price" ("₹3,000.00", pay the owner directly; one muted line at the page top: "Prices are paid directly to the owner."). Each time is labelled with the **booking's** `timeZone`.
- Actions (`flex flex-wrap gap-2`): `Button variant="outline" size="sm" asChild` "View space" (+ sr-only " {space name}") to `/spaces/{space.id}`; and, only for **Upcoming**, `Button variant="outline" size="sm"` "Cancel booking" (+ sr-only " at {space name} starting {first slot date}") with `text-destructive`. For **In progress** the button is replaced by muted text "Started. It can't be cancelled." (not a disabled button, so the reason is visible).
- Mobile: dl one column; `sm` and up `sm:grid-cols-2` for the dl, actions right-aligned on the same row as the h2 from `md`.

### 6.1 Cancel flow

"Cancel booking" opens `AlertDialog`: title "Cancel this booking?", description "{Pass name} at {space name}, seat {label}, {start date} to {end date}. The whole pass is cancelled and the seat is freed. This can't be undone." Buttons `Button variant="outline"` "Keep booking" (**initial focus**) and `Button variant="destructive"` "Cancel booking". Pending: "Cancelling…", spinner, `aria-busy`, both disabled, dialog not dismissable (action calls `preventDefault`).

- **Success (200, including an already-cancelled booking):** dialog closes, `toast.success("Booking cancelled")`, the list refetches and the card disappears, and a polite status announces "Booking at {space name} cancelled." **Focus moves to the next card's h2, else the previous card's h2, else the empty state's "Find a space" button.** Invalidate `useBookingsListMine` (all variants) and seat availability.
- **409 `booking:already-started`:** dialog closes, page Alert (focused) section 8, list refetched; that card now shows "In progress" and the no-cancel text.
- **404:** dialog closes, page Alert (focused) "We couldn't find that booking", list refetched.
- Other failures: page Alert with the fallback title "We couldn't cancel that booking".
- Page Alert slot: one `<div>` under the intro text; replaced, not stacked.

### 6.2 States

| State    | Behaviour                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Cards as above, soonest first (API order).                                                                                                                  |
| Hover    | Buttons and links per 01 2.4; the card does not change.                                                                                                     |
| Focus    | Tab order: main nav, then per card "View space", "Cancel booking" (when shown). h2 is not a tab stop.                                                       |
| Disabled | The pending dialog's buttons only. List buttons stay enabled while one cancel runs; a second dialog cannot open because the first is modal.                 |
| Loading  | `Skeleton h-44 rounded-xl` x 3, list `aria-busy`, sr-only polite "Loading your bookings…". The h1 and intro render at once.                                 |
| Empty    | `Card`: "You have no upcoming bookings." (`font-medium`), muted "Find a space and book a seat by the day, week or month.", `Button asChild` "Find a space". |
| Error    | `Alert variant="destructive"` "We couldn't load your bookings", "Try again in a moment.", `Button variant="outline" size="sm"` "Try again". 401 per 01 2.5. |
| Success  | Cards; after cancel see 6.1.                                                                                                                                |

## 7. Dashboard "Next booking" (T057, in the 01 section 5.2 frame)

Uses `useBookingsListMine({ limit: 1 })`. States and card as 01 section 5.2 (Loading, Empty, Error, Success). Additions:

- Success card: space name, `Badge variant="outline"` "{Pass name} · {slot name}", "Starts {firstStartsAt}" (zone labelled) or, once started, "Started {firstStartsAt}", "Seat {label}", link "View booking" (to `/bookings`, `text-primary underline`). Muted "Ends {lastEndsAt}" for passes longer than a day.
- Cancelling or booking invalidates this query (section 5.2 and 6.1), so the card updates without a reload.
- Loading, empty and error copy are unchanged from 01.

## 8. Problem copy (`lib/marketplace-problems.ts`, as 01 section 7)

Web titles and descriptions are the user's wording; the API `title` and `detail` (contracts/README registry) are never shown. Interpolate only what the client holds. `{type}` is after `urn:bseat:problem:`.

| `type` (status)                          | Action      | Shown as   | Title                                  | Description                                                                                             | Extra                                                                         |
| ---------------------------------------- | ----------- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `booking:seat-unavailable` (409)         | book        | page Alert | Seat no longer available               | "{label} was taken for part of that period while you were deciding. Choose another seat or start date." | refetch seats, clear selection                                                |
| `booking:user-overlap` (409)             | book        | page Alert | You already have a booking then        | "One of your bookings overlaps this period. Choose another start date or cancel the other booking."     | link "My bookings" to `/bookings`                                             |
| `booking-rule:space-not-published` (422) | book        | page Alert | This space is no longer listed         | "You can't book it now. Bookings you already have stay valid."                                          | link "Find a space"; refetch listing (it will 404)                            |
| `booking-rule:own-space` (422)           | book        | page Alert | This is your space                     | "You can't book a seat in your own space. Mark it occupied instead."                                    | link "Manage seats" to `/owner/spaces/{id}/seats`; unreachable normally (4.6) |
| `booking-rule:pass-not-offered` (422)    | book, seats | page Alert | That pass isn't offered                | "The owner doesn't offer this pass for that slot. Choose another pass or slot."                         | refetch listing; clear selected pass                                          |
| `booking-rule:start-day-closed` (422)    | book        | page Alert | That seat is closed on your start date | "Choose another start date or another seat."                                                            | refetch seats                                                                 |
| `booking-rule:slot-started` (422)        | book        | page Alert | That slot has already started          | "Choose a later start date."                                                                            | focus stays on the Alert; date field keeps its value                          |
| `booking-rule:too-far-ahead` (422)       | book        | page Alert | That's too far ahead                   | "You can book up to 30 days ahead. Choose an earlier start date."                                       |                                                                               |
| `booking:already-started` (409)          | cancel      | page Alert | This booking has already started       | "It can no longer be cancelled."                                                                        | list refetched                                                                |
| `http-404`                               | book        | page Alert | That seat isn't available              | "It may have been removed. The seat list is up to date." (seat or space gone)                           | refetch seats; if the listing 404s the page shows 4.6                         |
| `http-404`                               | cancel      | page Alert | We couldn't find that booking          | "It may have been removed. Your list is up to date."                                                    | list refetched                                                                |
| `http-404`                               | space load  | page state | We couldn't find that space            | "It may have been unlisted."                                                                            | 4.6                                                                           |
| `validation` (400)                       | search      | Alert      | Check your search                      | "Check the details and try again."                                                                      | server validation of a filter; client checks should prevent it                |
| `validation` (400)                       | book        | page Alert | We couldn't book that seat             | "Check the details and try again."                                                                      |                                                                               |

**Fallbacks** by status for an unmapped `type`: 400 and 422 "Check the details and try again."; 401 title "Your session has ended", "Sign in again to continue." with a "Sign in" link (`/sign-in?next={path}` via `safeNext`); 403 "You don't have access to this."; 404 "We couldn't find that. It may have been removed."; 409 "That changed while you were working. Reload and try again."; network "Check your connection and try again."; 5xx "Something went wrong on our side. Try again in a moment."
Fallback Alert titles are "We couldn't {action}" with the screen's action: "load spaces", "load more spaces", "load this space", "load seats", "book that seat", "load your bookings", "cancel that booking". A fallback always has a retry or a way out (Try again, or the screen's link), never a dead end.

A booking that succeeded but whose emails were delayed or failed looks identical to the user (FR-021); the confirmation card does not claim delivery ("We're sending…").

## 9. Keyboard journey and focus management (SC-002)

**Dashboard to confirmed booking, keyboard only, with preferences set: 7 actions.**

| #   | Action                                                   | Where focus ends up                               |
| --- | -------------------------------------------------------- | ------------------------------------------------- |
| 1   | Activate "Find a space" (dashboard quick link)           | page loads; results appear from preferences (3.1) |
| 2   | Activate a result's name link                            | listing page loads at the top                     |
| 3   | Pick a tile in the pass radiogroup (arrow keys or Space) | pass group                                        |
| 4   | Type the start date in the date field                    | date field                                        |
| 5   | Pick a free seat (one tab stop, arrow keys, Space)       | seat group; selection card fills                  |
| 6   | Activate "Review booking"                                | dialog, on "Change selection"                     |
| 7   | Move to and activate "Confirm booking" (Tab, Enter)      | confirmation h2 "Booking confirmed"               |

The design budget is that every next target is within 8 Tab stops of the previous one (the pass and seat radiogroups are one stop each; the filters collapse to one stop below `md`). A renter without preferences adds the country choice (1 action, plus Search). The 60-second goal is therefore achievable by keyboard; qa measures the journey in T044.

**Focus rules.** Results never take focus (3.4); paging moves focus to the first new card; the review dialog opens on "Change selection" and returns focus to "Review booking" on close without booking; a booking failure focuses the page Alert; success focuses "Booking confirmed"; a cancel returns focus per 6.1; a refetch never moves focus.
**ARIA summary.** Combobox (3.3); `role="search"` form; `radiogroup` for passes and seats with disabled items kept in the tree; every status line is `role="status"` and static between updates; Alerts `role="alert"` with `tabIndex={-1}`; dialogs are `AlertDialog` (`role="alertdialog"`, labelled by the title, described by the body).

## 10. Contrast and accessibility notes

- Pairs (all from tokens.md, no new pair): `foreground`, `muted-foreground` on `background`, `card`, `muted`, `popover` (6.00 and up; taken tile 5.50 / 6.09); `success` on `card` for "Free" and the saving line (5.65 / 7.67); `destructive` on `card` for errors and "Cancel booking" (5.43 / 6.15; `destructive` text on `destructive/10` is 4.57 / 4.60, so do not lighten it); `primary` on `background` and `card` for links (7.69 / 7.13); `primary-foreground` on `primary` for the main buttons (7.37 / 7.88); the selected tile `primary/5` tint with `foreground` and `success` (5.23 / 6.57). Focus and selection outlines `ring` / `primary` (7.69 / 7.13, 3:1 needed).
- No colour-only meaning: seat state is icon plus word (free, taken, closed); selected tiles add the radio dot and `aria-checked`; the active combobox option adds an outline; booking progress is the "Upcoming" / "In progress" word; the saving is text.
- Dark theme: the same classes (tokens switch), nothing to add. Checked pairs for dark are the second number above.
- Headings: find page h1, h2 "Results", h3 per card; listing h1, h2 sections ("About this space", "Choose a pass", "Choose a seat", "Your selection"); bookings h1, h2 per booking.
- Reduced motion: no animation beyond shadcn defaults and the spinner.
- Touch: targets 44 px on mobile (01 section 1); tiles `min-h-16`.
- qa (T042, T044): axe on `/find` (start, results, empty with widen action, error, mobile filters open, combobox open), `/spaces/{id}` (loading skeleton, 404, own space, passes only, seats with free/taken/closed, "no seat free", review dialog open, confirmation), `/bookings` (list, empty, cancel dialog open, error), `/dashboard` (renter with and without a booking). Screenshots at 375, 768 and 1280 px, light and dark. Keyboard-only run of section 9 and of the cancel flow.

## 11. Decisions and open questions

None blocks the frontend tasks. Each interim below is the designer's choice; a human or architect may override it.

| Id       | Question                                                                                                                                                                                              | Interim used here                                                                                                                          | Affects    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| OQ-T29-1 | Should changing a filter re-run the search live, or only on "Search"?                                                                                                                                 | Only on "Search" or Enter, so results never move under a screen reader or keyboard user (3.1). Initial prefilled search runs once on load. | T039       |
| OQ-T29-2 | Where does the confirmation live: a dialog plus an in-page success card, or a route like `/bookings/{id}`? There is no booking-detail route in the contracts.                                         | In-page: review `AlertDialog`, then a success Card (5.2, 5.3). My bookings is the durable record.                                          | T041       |
| OQ-T29-3 | Nothing is preselected on the listing page unless the search carried a pass, slot and date. Should the cheapest offer and today be preselected to speed up booking?                                   | No preselection (explicit choice; 7 actions for SC-002).                                                                                   | T031, T040 |
| OQ-T29-4 | The `max` of the start date is today + 30 days, but `too-far-ahead` is measured from the first slot's start (+ 30 × 24 h). A night slot on the last day can be refused. Should the UI hide that date? | Keep the range as stated and show the `too-far-ahead` copy if refused (4.3). Needs the server's "now" to do better.                        | T040       |
| OQ-T29-5 | Search shows the lowest price per pass **type** only (API shape). Should a card say which slot it belongs to?                                                                                         | No. The card says "From …" and the listing page shows every slot (3.4).                                                                    | T039       |
| OQ-T29-6 | "Hide seats that aren't free" and the "{free} of {total}" count are designer additions for spaces with many seats (up to 200). Not in the spec.                                                       | Included, unchecked by default (4.4). Drop if unwanted; no API change.                                                                     | T040       |
| OQ-T29-7 | Should a renter see an "In progress" booking at all? The API returns bookings with `ends_at > now` (AC 7.1), so a started pass is listed; AC 7.2 says it cannot be cancelled.                         | Listed, labelled "In progress", with "Started. It can't be cancelled." (6).                                                                | T057       |

## Handoff note for frontend-dev

Build order follows the dependency graph: T039 (find, section 3), T031 (listing page, 4.1 to 4.4, 4.6), T040/T041 (seats, review, confirmation, 5), T057 (my bookings, dashboard, 6 and 7). `lib/marketplace-problems.ts` gets the section 8 rows; the pass, slot and money helpers are the ones in `lib/format.ts`.
