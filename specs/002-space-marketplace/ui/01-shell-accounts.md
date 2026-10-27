# UI 01: Shell, navigation, sign-up and dashboards

**Task**: T010 · **Used by**: T014 (shell, nav, dashboards), T015 (sign-up, preferences), T016 (qa)
**Spec**: US1, AC 1.1 to 1.6, FR-001 to FR-005, FR-032, FR-033, OQ-9 · **Contracts**: [accounts.md](../contracts/accounts.md)

## 1. Components

Reuse from `@bseat/ui`: Alert, Badge, Button, Card, Input, Label, NativeSelect, RadioGroup, Skeleton, Sonner.
**No new shadcn component and no token change.** Icons are lucide, always `aria-hidden` beside text:
`MenuIcon`, `XIcon`, `ChevronRightIcon`, `Loader2Icon`, `CircleCheckIcon`, `SearchIcon`, `CalendarIcon`, `PlusIcon`.
The mobile menu is **not** a dialog or sheet: it is a disclosure (section 2.3), so no `sheet` component is needed.

## 2. Signed-in shell (`app/(app)/layout.tsx`, `components/app-nav.tsx`)

### 2.1 Structure and DOM order (= tab order)

1. **Skip link** "Skip to main content" (`href="#main"`), first focusable element, `sr-only focus:not-sr-only`, shown at
   top-left as `Button`-styled (`bg-primary text-primary-foreground`, `rounded-md px-3 py-2`, `z-50`).
2. `<header class="border-b bg-background">` with a `max-w-6xl mx-auto flex items-center gap-4 px-4 sm:px-6 h-14`:
   - Brand link "BSeat" to `/dashboard` (`font-semibold`).
   - `<nav aria-label="Main">` with the role's links (section 2.2).
   - Right: user name (`text-sm text-muted-foreground`, truncated, hidden below `md`) and the existing Sign out button.
3. `<main id="main" tabIndex={-1}>`: each page keeps `mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 sm:py-12`
   (owner management pages use `max-w-6xl`). Pages own their `<h1>`; the shell never renders one.

The 001 per-page "Dashboard" back link and cross-link buttons are removed from `/book` when the shell lands (T014);
the shell is the way back.

### 2.2 Links per role (label, route, notes)

Order is the visual and tab order. `lib/nav.ts` is the single source; the route-manifest test enforces it.

| Role       | Label        | Route               | Active when path                                 | Exists from                                                  |
| ---------- | ------------ | ------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| both       | Dashboard    | `/dashboard`        | equals                                           | T014                                                         |
| both       | Find a space | `/find`             | starts with `/find` or `/spaces/` (listing page) | T014 links `/book` until T039                                |
| both       | My bookings  | `/bookings`         | starts with `/bookings`                          | T057 (link added then; T014 omits it if the route is absent) |
| owner only | List a space | `/owner/spaces/new` | equals                                           | T023                                                         |

- Renter nav: Dashboard, Find a space, My bookings.
- Owner nav (OQ-9: owners may also book): Dashboard, List a space, Find a space, My bookings. "My spaces" is the owner
  dashboard itself (its h1 is "My spaces"), so it has no separate link; the Dashboard label stays constant for both roles.
- A nav item appears only once its route exists (typedRoutes). T014 therefore ships Dashboard and Find a space
  (to `/book`); `My bookings` and `List a space` are added by T057 and T023.
- Active page: the matching link gets `aria-current="page"` and the active style (`bg-secondary text-secondary-foreground
font-medium`); never colour alone, since weight also changes. At most one link is current. Pages reached from a nav
  page (for example `/owner/spaces/[spaceId]/seats`) keep their parent's link current only for `Find a space`
  (`/spaces/…`); owner management pages leave the main nav with none current except `Dashboard`, which is current for
  `/owner/spaces/[spaceId]/…` because spaces are listed there (path starts with `/owner/spaces/` and is not `new`).

### 2.3 Layout and behaviour per breakpoint

| Breakpoint         | Layout                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 640 mobile       | Header row: brand, then a `Button variant="outline" size="icon"` menu toggle (`MenuIcon` / `XIcon`, `aria-label="Menu"`, `aria-expanded`, `aria-controls="main-nav-list"`) at the right. Links render in a full-width panel under the header (`border-b bg-background`, `grid gap-1 p-2`), each link `min-h-11` full width. Sign out is the last item in the panel. |
| 640 to 1023 tablet | Inline links (`flex gap-1`), text `text-sm`, user name hidden, Sign out at the right.                                                                                                                                                                                                                                                                               |
| >= 1024 desktop    | As tablet with the user name shown and `gap-2`.                                                                                                                                                                                                                                                                                                                     |

Mobile disclosure: toggling moves no focus. **Escape** closes the panel and returns focus to the toggle; choosing a link
closes it (route change). The panel is a plain list in DOM order right after the toggle, so Tab goes toggle, links,
Sign out, then main. Closed on first render. Without JS the list is hidden by the same `hidden`/`sm:flex` classes
(client component; the shell loads `useMeGet`, section 2.5, so JS is required anyway).

### 2.4 Link states

| State    | Style                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Default  | `text-muted-foreground text-sm rounded-md px-3 py-2` (6.00 / 7.98 on `background`)                               |
| Hover    | `bg-muted text-foreground` (`foreground` on `muted` is above 4.5:1; muted-foreground on `muted` is 5.50 / 6.09)  |
| Focus    | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` (7.69 / 7.13), never removed |
| Active   | `aria-current="page"`: `bg-secondary text-secondary-foreground font-medium` (16.42 / 14.48)                      |
| Disabled | not used: a link the role cannot use is not rendered                                                             |

### 2.5 Shell data states (`useMeGet`)

| State   | Behaviour                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | Header shows brand, three `Skeleton h-8 w-24` link placeholders, `aria-busy="true"` on the nav, sr-only polite "Loading navigation…". The page content still renders (it does not need the role unless it is role-specific).                                                                                                                                                          |
| Error   | Nav shows only the brand plus Sign out, and under the header a full-width `Alert variant="destructive"` (`role="alert"`) title "We couldn't load your account" with description "Check your connection and try again." and `Button variant="outline" size="sm"` "Try again" (refetch). Never guess a role: no role links show. 401 is handled by the existing redirect to `/sign-in`. |
| Empty   | n/a                                                                                                                                                                                                                                                                                                                                                                                   |
| Success | Role links as in 2.2. A user whose `accountType` is `renter` because the account predates the feature sees the renter nav, with no notice (FR-003, AC 1.6).                                                                                                                                                                                                                           |

Role-specific pages (owner pages under `/owner/*`) opened by a renter: 403 page content "This page is for space
owners." with link "Go to dashboard" (no detail about any space).

## 3. Management sub-nav pattern (owner pages, used from T022)

`app/(app)/owner/spaces/[spaceId]/layout.tsx` renders, above the page `<h1>`, the space name and status badge, then
`<nav aria-label="Space management">`:

| Label             | Route (under `/owner/spaces/[spaceId]`) | Page task |
| ----------------- | --------------------------------------- | --------- |
| Details           | `/`                                     | T022      |
| Seats and layout  | `/seats`                                | T024      |
| Passes and prices | `/pricing`                              | T030      |
| Availability      | `/availability`                         | T052      |
| Bookings          | `/bookings`                             | T058      |

Each task adds only its own link. The current item has `aria-current="page"` and a bottom border
`border-b-2 border-primary` plus `font-medium` (text stays `foreground`, so the signal is not colour alone).
Layout: below `md` a single horizontally scrollable row (`flex overflow-x-auto gap-1`, `scroll-px-4`, no wrapping,
links `min-h-11 px-3 whitespace-nowrap`), from `md` a wrapped row with a `border-b`. Tab order: main nav, then the
sub-nav, then the page content. Hover `bg-muted`, focus as 2.4. A "Back to My spaces" link is not needed (the main nav's
Dashboard is current and returns there). Status badge: "Published" (`Badge`, with `CircleCheckIcon text-success`)
or "Draft" (`Badge variant="outline"`); text always present.

## 4. Sign-up (`(auth)/sign-up`, `components/auth-form.tsx`)

Two steps on one route, state held in the page: **Step 1 "Create your account"**, **Step 2 "Your preferred location"**
(renters only). Owners finish after step 1 and go to `/dashboard`. The `(auth)` layout is unchanged (centered card).

### 4.1 Step 1 fields and order

1. Name, Email, Password (unchanged copy and errors from 001).
2. `<fieldset>` with `<legend>I want to</legend>` and a `RadioGroup` (`aria-required="true"`, `required`), two cards:
   - "I own a space" / description "List seats and passes for renters to book." (value `owner`)
   - "I need a space" / description "Find and book a seat by the day, week or month." (value `renter`)
3. Submit button "Create account".

No option is preselected (a required choice must be a deliberate one). Cards use the 001 space-card pattern: `Label`
as the tile, `rounded-lg border bg-card p-3`, `RadioGroupItem` with `aria-describedby` to its description, selected
`border-primary ring-1 ring-primary bg-primary/5`; tiles `min-h-16`. Mobile: stacked, one column. From `sm`: two columns.
Radix roving focus: one tab stop, arrows move and select. Legend text is `text-sm font-medium`; a visible "(required)" is
not added, matching the other fields; the field error covers it.

| State    | Behaviour                                                                                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Nothing selected                                                                                                                                                                                                                                                                                      |
| Hover    | tile `bg-muted/50`                                                                                                                                                                                                                                                                                    |
| Focus    | tile `outline-2 outline-offset-2 outline-ring`                                                                                                                                                                                                                                                        |
| Selected | border, ring and tint as above, filled dot                                                                                                                                                                                                                                                            |
| Disabled | all inputs and the radio group disabled while submitting                                                                                                                                                                                                                                              |
| Error    | no choice on submit: `<p id="{id}-accountType-error" class="text-destructive text-sm">Choose whether you own a space or need one</p>` under the group, group `aria-describedby` that id and `aria-invalid="true"`; the first invalid field gets focus (RHF `shouldFocusError`). Cleared on selection. |
| Loading  | submit `aria-busy`, label "Please wait…", fields disabled                                                                                                                                                                                                                                             |

Server errors from Better Auth: `MISSING_FIELD` and `VALIDATION_ERROR` on `accountType` map to the same role field
error (never raw `error.message`). A duplicate email keeps the existing form-level destructive Alert. Any other failure:
Alert "We couldn't create your account. Try again." (`role="alert"`).

### 4.2 Step 2: preferences (renter only, optional)

Shown after a successful sign-up as a renter (the account already exists and the user is signed in; reload lands on
`/dashboard`). Heading `h1` "Where do you want a space?" (focus moves to it, `tabIndex={-1}`), intro (muted) "Optional.
We use this to fill in your search. You can change it later on your dashboard."

Fields (same component as dashboard editing, section 6.3): **Country** (`NativeSelect`, first option "No preference",
then `useReferenceGet().countries` by name), **City** (`Input`, `autoComplete="address-level2"`, max 100), **Area or
locality** (`Input`, max 100). City and Area are disabled until a country is chosen only if the form chooses to couple them;
this spec does **not** couple them (each is independent, matching the nullable contract). Buttons: primary "Save and
continue", `variant="ghost"` "Skip for now". Both go to `/dashboard`.

| State             | Behaviour                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading           | Country select `disabled` with a single option "Loading countries…" (`aria-busy`); City and Area usable. Save is enabled.                                                                            |
| Error (reference) | Under the select: "We couldn't load the country list. You can add it later from your dashboard." with "Try again" `Button variant="link" size="sm"`; Save and Skip still work.                       |
| Error (save)      | Non-blocking: navigate to `/dashboard` regardless, and show `toast.error("Your account is ready, but we couldn't save your preferences. Add them from your dashboard.")`. The account stands (T015). |
| Validation        | Blank text becomes `null` (trimmed); over 100 characters: "Use 100 characters or fewer" tied by `aria-describedby`.                                                                                  |
| Success           | all three empty: skip the request (same as Skip). Otherwise on save, go to `/dashboard`; toast "Preferences saved".                                                                                  |
| Disabled          | while saving: both buttons and fields disabled, Save shows `Loader2Icon` + "Saving…" and `aria-busy`.                                                                                                |

Keyboard order: Country, City, Area, Save and continue, Skip for now.

Layout: single column `max-w-md` at every breakpoint (the `(auth)` layout width); buttons stack on mobile (full width,
Save first), side by side from `sm`.

## 5. Dashboards (`(app)/dashboard`)

Page frame: `max-w-4xl`, h1 then sections, section headings `h2 text-lg font-medium`. The 001 "Welcome, {name}" row stays
as a greeting line (`p`, muted: "Signed in as {name}") under the h1; **h1 is the role title** ("Dashboard" for renters, "My
spaces" for owners). Sign out moves to the shell header, so the Welcome row's Sign out button is removed.

### 5.1 Renter dashboard

Order: h1 "Dashboard"; greeting; quick links; **Next booking** section; **Your preferences** section.

- Quick links: `<nav aria-label="Quick links">`, `Button asChild` "Find a space" (`SearchIcon`) and `Button variant="outline" asChild`
  "My bookings". Mobile `grid gap-3`; from `sm` `flex`. "My bookings" is omitted until its route exists (T057).
- **Next booking slot** (`<section aria-labelledby="next-heading">`, h2 "Next booking"). T014 renders only the empty state;
  T057 fills the summary using the same frame so the layout does not move.

| State   | Content                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | `Skeleton h-28 rounded-xl`, section `aria-busy="true"`, sr-only polite "Loading your next booking…"                                                                                                                                                                       |
| Empty   | `Card` with `CalendarIcon` (aria-hidden), text "You have no upcoming bookings." (`font-medium`), muted "Find a space and book a seat by the day, week or month." and `Button asChild` "Find a space". This is T014's state.                                               |
| Error   | `Alert variant="destructive"` title "We couldn't load your bookings", description "Try again in a moment.", `Button variant="outline" size="sm"` "Try again"                                                                                                              |
| Success | `Card`: space name (`font-medium`), "{Pass name} · {Slot name}" (`Badge variant="outline"`), "Starts {when}" per section 7, seat label ("Seat A-12"), link "View booking" to `/bookings` (underlined `text-primary`). Hover: none (card is not interactive; the link is). |

### 5.2 Owner dashboard (slot for T023)

Order: h1 "My spaces"; greeting; header row with `Button asChild` "List a space" (`PlusIcon`, to `/owner/spaces/new` once it
exists); **Spaces** list. T014 ships the h1, greeting and a placeholder slot; T023 fills it.

Space card (`Card`): name as h2 `text-base font-medium`, "{area}, {city}", `Badge` "Published" / "Draft", and a
`<nav aria-label="Manage {space name}">` with links Details, Seats and layout, Passes and prices, Availability, Bookings
(same labels and routes as section 3; `Button variant="outline" size="sm" asChild`, wrapping, `flex flex-wrap gap-2`).
Links appear as their pages ship. The Details link wraps the space name too (h2 content is a link). Grid: 1 column
mobile, `md:grid-cols-2`.

| State   | Content                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading | 2 x `Skeleton h-36 rounded-xl`, `aria-busy`, sr-only polite "Loading your spaces…"                                                                                                         |
| Empty   | `Card` text "You haven't listed a space yet." muted "Add your space's details and seats, then set pass prices to start taking bookings." `Button asChild` "List your first space" (AC 1.4) |
| Error   | `Alert variant="destructive"` "We couldn't load your spaces", "Try again in a moment.", "Try again" button                                                                                 |
| Success | Cards as above                                                                                                                                                                             |

Owners also have the renter flows through the nav (OQ-9); the owner dashboard shows no next-booking section.

### 5.3 Breakpoints and live regions

Mobile: single column, buttons full width. Tablet and up: preferences and next booking stack in one column up to `md`,
then `md:grid-cols-2` (next booking left, preferences right). Loading text uses `aria-live="polite"` on the skeleton wrapper;
errors use `role="alert"`; empty and success are static content. Toasts (Sonner) are a polite status and never the only
carrier of an outcome that has a persistent control.

## 6. Preferences editing (renter dashboard)

### 6.1 View mode (default)

h2 "Your preferences" in a `Card`. A `<dl>`: "Country" (name from reference, or "Any"), "City" ("Any"), "Area" ("Any")
and `Button variant="outline" size="sm"` "Edit preferences" (`aria-expanded` not needed; it swaps content). When all three are
null the card says "You haven't set a preferred location. Search starts empty." muted, and the button reads "Add preferences".
Country shows the **name** looked up from `/api/reference`; while that loads, show `Skeleton h-4 w-24`, never the code.

### 6.2 Loading, error and success of the card

| State   | Behaviour                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| Loading | Skeleton lines in the `dl`, `aria-busy` (data comes from `useMeGet`, already cached by the shell)          |
| Error   | If `useMeGet` failed the shell Alert (2.5) already shows; the card shows nothing.                          |
| Success | After saving, back to view mode, `toast.success("Preferences saved")`, focus returns to "Edit preferences" |

### 6.3 Edit mode (`components/preferences-form.tsx`, shared with sign-up step 2)

Fields as 4.2, prefilled. Buttons: `Button` "Save preferences", `variant="ghost"` "Cancel" (restores view mode, focus to
"Edit preferences"). A `Button variant="link" size="sm"` "Clear all" empties the three fields (it does not submit).
Saving all-empty sends all three `null` (clears, AC 1.2). On focus entering edit mode, move focus to the Country select.

| State    | Behaviour                                                                                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disabled | While saving, fields and both buttons disabled; Save `aria-busy`, "Saving…" with spinner                                                                                                                                                                                                                    |
| Error    | `PUT` failure: `Alert variant="destructive"` (`role="alert"`, `tabIndex={-1}`, receives focus) title "We couldn't save your preferences", description "Your previous preferences are unchanged. Try again." Field data is kept. A 403 (an owner reaching this) is not reachable: owners never see the card. |

Layout: fields in one column on mobile; from `md` Country, City, Area in `grid-cols-3`, buttons below. Inputs have a
`Label` above each; no placeholder-only labels.

## 7. Shared copy and format conventions (all area specs)

- **Voice**: short, plain, sentence case, second person; buttons are verb phrases ("List a space", "Book seat"). No
  exclamation marks. Errors say what happened and what to do next. No raw server `message` or `detail` is shown.
- **Terms**: "space" (not office, location), "seat", "pass", "slot". Role names in UI: "I own a space", "I need a space".
  Never show "accountType", "renter" or "owner" as jargon except in nav labels of owner pages ("owner" appears only in 403 copy).
- **Pass names**: "Day pass", "Weekly pass", "Monthly pass" (day = 1 day, weekly = 7 consecutive days, monthly = 30
  consecutive days; always show the end date next to a weekly or monthly pass, per the spec).
- **Slot names**: "Day slot", "Night slot", "24-hour slot", "Working hours". With times: "Day slot, 07:00 to 19:00" (24-hour
  clock, "to"). Overnight slots add "next day": "Night slot, 19:00 to 07:00 next day".
- **Times and dates (FR-033)**: always in the space's own zone and labelled with it. Format
  `Intl.DateTimeFormat('en', …)` with `timeZone` set to the space zone and `timeZoneName: 'short'`:
  "Mon 3 Nov, 07:00 IST". Date alone: "Mon 3 Nov 2026" (year when not the current year, or on confirmations).
  Ranges: "Mon 3 Nov, 07:00 to Tue 4 Nov, 07:00 IST" (zone once, at the end). When the zone abbreviation is ambiguous or missing
  (for example `GMT+4`), also show the IANA id in muted text. Times outside a space context (for example account-level dates)
  show the viewer's zone, and are labelled the same way. All formatting lives in one helper (`lib/format.ts`), tested by
  zone (including a DST day).
- **Money**: API string `{ amount, currency }` formatted with `Intl.NumberFormat('en', { style: 'currency', currency })`
  (symbol and grouping by currency, 2 decimals unless the currency has none). Never concatenate symbols by hand. Pass prices read
  "INR 1,500.00" style only when the symbol is ambiguous; otherwise the formatter's default ("₹1,500.00"). Prices are
  "per {pass}": "₹1,500.00 per day pass". Savings: "Save ₹300.00 (17%)", text only; percentages rounded to whole numbers.
- **Counts**: "1 seat", "12 seats"; "No seats yet".
- **Problem copy approach (`lib/marketplace-problems.ts`)**: map `problem.type` (prefix `urn:bseat:problem:`) plus an
  `action` key to `{ title, description }`, with the same shape, fallbacks and `ProblemAlert` pattern as
  `booking-problems.ts` (001 ui.md section 6). Titles state the outcome ("Seat no longer available"); descriptions say the
  next step and may include one inline link. Interpolate only values the client already holds (seat label, space name,
  time zone); never problem `detail`. Fallbacks by status: 400/422 "Check the details and try again."; 401 redirect to
  sign-in; 403 "You don't have access to this."; 404 "We couldn't find that. It may have been removed."; 409 "That changed
  while you were working. Reload and try again."; network "Check your connection and try again."; 5xx "Something went wrong
  on our side. Try again in a moment." Each area spec lists its own types; this one adds none.
- **Toasts** only for confirmations of non-blocking, repeatable actions ("Preferences saved"). Outcomes the user must act
  on use an inline Alert that receives focus.

## 8. Accessibility and contrast

- One `<h1>` per page, order never skips a level. Landmarks: `header`, `nav` ("Main", plus "Space management", "Quick
  links" where present, each uniquely labelled), `main`.
- Keyboard: skip link, brand, nav links, user area, Sign out, then main. No keyboard trap in the mobile panel; Escape closes it.
- Focus ring on every interactive element: `outline-ring` solid, 7.69 / 7.13 against `background` and `card` (needs 3:1).
  Shadcn's 3 px halo is supplementary only (tokens.md finding F1).
- Radio tiles, text and badges use only pairs already in tokens.md: `foreground` / `muted-foreground` on `background`,
  `card` and `muted`; `secondary-foreground` on `secondary` (16.42 / 14.48); `primary` on `background` (7.69 / 7.88);
  `success` on `card` (5.65 / 7.67); `destructive` on `card` (5.43 / 6.15); selected tint `primary/5` (light) with
  `foreground`. Nav active style `secondary` is not distinguished from `background` by colour alone (weight and
  `aria-current`). The field boundary finding F2 in tokens.md applies unchanged: radio tiles and inputs keep the `border`
  plus label so meaning never depends on the border.
- Status and role are always text ("Draft", "Published", "I own a space"), never colour alone.
- Touch targets: nav links, tiles, buttons at least 44 px tall on mobile (`min-h-11`).
- Reduced motion: no animation beyond the shadcn defaults and the spinner.
- Tests (qa): axe on `/sign-up` (both steps, error state), `/dashboard` (renter and owner, each of loading, empty, error),
  mobile menu open, with 375, 768 and 1280 px screenshots.

## Open questions

None blocking. Assumptions to confirm: (1) T014 hides "My bookings" and "List a space" until their routes exist;
(2) owner management pages keep "Dashboard" current in the main nav.
