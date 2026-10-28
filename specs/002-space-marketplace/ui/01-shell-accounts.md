# UI 01: Shell, navigation, sign-up and dashboards

**Task**: T010 · **Used by**: T014 (shell, nav, dashboards), T015 (sign-up, preferences), T022 (owner gate), T016 (qa)
**Spec**: US1, AC 1.1 to 1.6, FR-001 to FR-005, FR-032, FR-033, OQ-9 · **Contracts**: [accounts.md](../contracts/accounts.md)

## 1. Components

Reuse from `@bseat/ui`: Alert, Badge, Button, Card, Input, Label, NativeSelect, RadioGroup, Skeleton, Sonner.
**No new shadcn component and no token change.** Icons are lucide, always `aria-hidden` beside text: `MenuIcon`,
`XIcon`, `Loader2Icon`, `CircleCheckIcon`, `SearchIcon`, `CalendarIcon`, `PlusIcon`. The mobile menu is a disclosure
(section 2.3), not a dialog, so no `sheet` is needed.

**Touch targets (44 px, house rule for mobile).** shadcn's default Button is `h-8` (32 px), `lg` is `h-9` (36 px). On these screens add
`max-sm:min-h-11` to every Button and nav link (the `sm` and up height is unchanged). The menu toggle is
`Button variant="outline" size="icon" className="size-11"` (`icon-lg` is only `size-9`, 36 px, so it is not used).
Radio tiles are `min-h-16`.

## 2. Signed-in shell (`app/(app)/layout.tsx`, `components/app-nav.tsx`)

### 2.1 Page structure (one skip link, one `<main>`)

- The **only** skip link is the root one in `app/layout.tsx` ("Skip to content", `href="#main"`). The shell does not add another.
- The shell layout renders `<header>` (brand, nav, user area) and then `{children}` directly. It renders **no** `<main>`.
  Every page under `(app)` keeps its own single `<main id="main">` and `<h1>` (the existing rule in `apps/web/AGENTS.md`
  stands; no change to it). The skip link therefore jumps past the header to the page's `main`.
- Shell notices (loading skeletons, the error Alert of 2.5) live inside `<header>`, never inside `main`.
- Header: `border-b bg-background`, inner `mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6`. DOM order is
  the tab order: brand link "BSeat" (to `/dashboard`, `font-semibold`), `<nav aria-label="Main">`, user name
  (`text-sm text-muted-foreground`, hidden below `md`, not focusable), Sign out button (existing component).
- Page frame is unchanged: `mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 sm:py-12` (owner management pages `max-w-6xl`).
- The 001 `/book` page drops its own Dashboard back link and cross-link button when the shell lands (T014).

### 2.2 Links per role (one row per link)

`lib/nav.ts` is the single source and the route-manifest test enforces it. Order here is visual and tab order.
A link renders only once its route exists (`typedRoutes`), so "Added by" says when it appears.

| Role  | Label        | `href`                           | Exact match (`aria-current="page"`) | Parent match (`aria-current="true"`)         | Added by                                    |
| ----- | ------------ | -------------------------------- | ----------------------------------- | -------------------------------------------- | ------------------------------------------- |
| both  | Dashboard    | `/dashboard`                     | `/dashboard`                        | `/owner/spaces/…` except `/owner/spaces/new` | T014                                        |
| owner | List a space | `/owner/spaces/new`              | `/owner/spaces/new`                 | none                                         | T022 (the `new` page ships there)           |
| both  | Find a space | `/book` until T039, then `/find` | `/find`, and `/book` until T042     | `/spaces/…` (listing page)                   | T014 (to `/book`); T039 switches to `/find` |
| both  | My bookings  | `/bookings`                      | `/bookings`                         | `/bookings/…`                                | T057                                        |

- Renter nav: Dashboard, Find a space, My bookings. Owner nav (OQ-9: owners may also book): Dashboard, List a space,
  Find a space, My bookings.
- "My spaces" is the owner dashboard's h2, not a nav link; the Dashboard label is the same for both roles.
- Exactly one link is current at a time. `aria-current="page"` only on an exact match; `aria-current="true"` for a parent
  match (the user is inside that area). Both use the **same visual style** (2.4). Owner management pages
  (`/owner/spaces/[spaceId]/…`) therefore mark Dashboard `true`.

### 2.3 Layout per breakpoint

| Breakpoint         | Layout                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 640 mobile       | Header row: brand, then the menu toggle at the right (`aria-label="Menu"`, `aria-expanded`, `aria-controls="main-nav-list"`, `MenuIcon` / `XIcon`). The list is a full-width panel under the header (`border-b bg-background grid gap-1 p-2`), links `min-h-11`, Sign out last in the panel. |
| 640 to 1023 tablet | Inline links (`flex gap-1`, `text-sm`), user name hidden, Sign out at the right.                                                                                                                                                                                                             |
| >= 1024 desktop    | As tablet, user name shown, `gap-2`.                                                                                                                                                                                                                                                         |

Mobile disclosure: closed on first render; toggling moves no focus. **Escape** closes it and returns focus to the
toggle. **Clicking a link closes it** (and the route changes). Panel DOM order is right after the toggle, so Tab goes
toggle, links, Sign out, then the page. `app/(app)/layout.tsx` stays a Server Component; only `AppNav` and the shell notices (2.5) are client components (they read `useMeGet`).

### 2.4 Link states

| State    | Style                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | `text-muted-foreground text-sm rounded-md px-3 py-2` (6.00 / 7.98 on `background`)                                                                            |
| Hover    | `bg-muted text-foreground` (`muted-foreground` on `muted` would be 5.50 / 6.09; text turns `foreground`, above that)                                          |
| Focus    | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` (7.69 / 7.13), never removed                                              |
| Current  | `aria-current` (`page` or `true`): `bg-secondary text-secondary-foreground font-medium` (16.42 / 14.48). Weight changes too, so colour is not the only signal |
| Disabled | not used: a link the role cannot use is not rendered                                                                                                          |

### 2.5 Shell data states (`useMeGet`)

| State           | Behaviour (all inside `<header>`)                                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading         | Brand, three `Skeleton h-8 w-24` placeholders in the nav, nav `aria-busy="true"`, sr-only polite "Loading navigation…". The page still renders. Pages that need the role show their own skeleton (5.3, section 3.1).                                                                                                                      |
| Error (not 401) | Nav shows brand, **Dashboard** link and Sign out; no role links (never guess a role). Below the row, full-width `Alert variant="destructive"` (`role="alert"`): title "We couldn't load your account", description "Check your connection and try again.", `Button variant="outline" size="sm"` "Try again" (refetch).                    |
| Error 401       | Brand only (no Sign out, no Dashboard; intentionally, so "Sign in" is the only exit). `Alert variant="destructive"` (`role="alert"`): title "Your session has ended", description "Sign in again to continue." with link "Sign in" to `/sign-in?next={current path}` built with `safeNext` (same copy as 001 ui.md section 6 `http-401`). |
| Empty           | n/a                                                                                                                                                                                                                                                                                                                                       |
| Success         | Role links per 2.2. An account that predates this feature is a renter and sees the renter nav with no notice (FR-003, AC 1.6).                                                                                                                                                                                                            |

## 3. Owner pages

### 3.1 Owner gate (`app/(app)/owner/layout.tsx`, built in T022)

Client component. Reads `accountType` from `useMeGet` and **does not mount `children` for a renter**, so no owner API
calls (and no 403 fetches) fire. Every branch renders its own `<main id="main">` with an `<h1>`, except the owner branch
(children supply theirs).

| State   | Content                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading | `main` with `Skeleton h-8 w-64` (placeholder h1) and `Skeleton h-40 rounded-xl`, `aria-busy="true"`, sr-only polite "Loading…"; `h1` sr-only "Loading"                                                       |
| Renter  | h1 "This page is for space owners." and `Button asChild` "Go to dashboard" (`/dashboard`). Nothing about any space. On `/owner/spaces/new` the page's own metadata title shows above this copy (acceptable). |
| Error   | h1 "We couldn't check your account" (the shell Alert from 2.5 explains and offers Try again/Sign in); no children                                                                                            |
| Owner   | `{children}`                                                                                                                                                                                                 |

The API still answers 403 to a renter; the gate is a courtesy, not the control.

### 3.2 Management sub-nav pattern (used from T022)

`app/(app)/owner/spaces/[spaceId]/layout.tsx` renders, above each page's own `<h1>`, a `<nav aria-label="Space
management">`. (The space name and status badge, and that layout's loading, error and 404 states, are specified in
`ui/02-owner-listing.md` (T018); this spec fixes only the sub-nav.)

| Label             | Route (under `/owner/spaces/[spaceId]`) | Page task |
| ----------------- | --------------------------------------- | --------- |
| Details           | `/`                                     | T022      |
| Seats             | `/seats`                                | T024      |
| Passes and prices | `/pricing`                              | T030      |
| Availability      | `/availability`                         | T052      |
| Bookings          | `/bookings`                             | T058      |
| Layout            | `/layout`                               | T065      |

Each task adds only its own link. Current item: `aria-current="page"` (exact match), `border-b-2 border-primary` and
`font-medium` (text stays `foreground`). Below `md`: one horizontally scrollable row (`flex overflow-x-auto gap-1`,
links `min-h-11 px-3 whitespace-nowrap`); from `md`: wrapped row with `border-b`. Hover `bg-muted`, focus as 2.4. Tab
order: main nav, sub-nav, page.

## 4. Sign-up (`(auth)/sign-up`, `components/auth-form.tsx`)

The `(auth)` layout is `max-w-sm` and centred. Every control below is single column at every breakpoint.

**Signed-in visitors**: a signed-in user who opens `/sign-up` is redirected to `/dashboard`, and one who opens `/sign-in`
to `safeNext(next)` (default `/dashboard`). Both use a **server-validated session** (`authClient.useSession()` or
`getSession()` returning a user). Never use the proxy's `getSessionCookie` check for this: a stale cookie would redirect
here while the shell shows the 401 "Sign in" link, looping. T015 adds both redirects. Nothing else on these pages
assumes a reload lands on the dashboard.

### 4.1 Step 1: "Create your account"

1. Name, Email, Password (copy and errors unchanged from 001).
2. `<fieldset>` with `<legend>I want to</legend>` and a `RadioGroup` (`required`, `aria-required="true"`), two stacked tiles:
   - "I own a space" with description "List seats and passes for renters to book." (value `owner`)
   - "I need a space" with description "Find and book a seat by the day, week or month." (value `renter`)
3. Submit "Create account".

Nothing is preselected. Tiles follow the 001 space-card pattern: `Label` tile, `rounded-lg border bg-card p-3 min-h-16`,
`RadioGroupItem` with `aria-describedby` to its description; selected `border-primary ring-1 ring-primary bg-primary/5`.
Radix roving focus: one tab stop, arrows move and select. Use RHF `Controller`.

| State    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | nothing selected                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Hover    | tile `bg-muted/50`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Focus    | tile `outline-2 outline-offset-2 outline-ring`                                                                                                                                                                                                                                                                                                                                                                                            |
| Selected | border, ring, tint, filled dot                                                                                                                                                                                                                                                                                                                                                                                                            |
| Disabled | all fields, the group and submit disabled while submitting                                                                                                                                                                                                                                                                                                                                                                                |
| Loading  | submit `aria-busy`, label "Please wait…"                                                                                                                                                                                                                                                                                                                                                                                                  |
| Error    | no choice on submit: `<p id="{id}-accountType-error" class="text-destructive text-sm">Choose whether you own a space or need one</p>` under the group; the group has `aria-describedby` that id and `aria-invalid="true"`. Focus goes to the first invalid field: pass the `Controller`'s `field.ref` to the first `RadioGroupItem` (or call `setFocus` in `onInvalid`) so a role error is focused like the others. Cleared on selection. |

Server errors (never show raw `error.message`; map by Better Auth `code`):

| Code                                                           | Shown                                                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MISSING_FIELD`, `VALIDATION_ERROR` (on `accountType`)         | the role field error above                                                                                |
| `USER_ALREADY_EXISTS`, `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` | form Alert (`role="alert"`): "An account with this email already exists." and link "Sign in" (`/sign-in`) |
| anything else                                                  | form Alert: "We couldn't create your account. Try again."                                                 |

### 4.2 After a successful sign-up

The result depends on whether a session came back (`data.token`; production requires email verification, so
`token === null` there, `auth.ts`).

| Outcome                  | Next screen                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner, session           | `/dashboard`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Renter, session          | step 2 (4.3)                                                                                                                                                                                                                                                                                                                                                                                                        |
| Any role, **no session** | **"Check your email" success state** in place of the form. h1 "Check your email" (`tabIndex={-1}`, receives focus), text "We sent a link to {email}. Open it to confirm your account, then sign in." For a renter add muted "After you sign in, you can add your preferred location from your dashboard." Every role gets `Button asChild` "Go to sign in". No preferences step (there is no session to save with). |

### 4.3 Step 2: preferences (renter with a session, optional)

h1 "Where do you want a space?" (focus moves to it, `tabIndex={-1}`); this is the only name for this step. Intro (muted):
"Optional. We use this to fill in your search. You can change it later on your dashboard."

Fields (same `preferences-form.tsx` as dashboard editing, 6.3): **Country** (`NativeSelect`, first option "No
preference", then `useReferenceGet().countries` by name), **City** (`Input`, `autoComplete="address-level2"`), **Area or
locality** (`Input`). Each is independent. Buttons stacked, full width: `Button` "Save and continue", then
`variant="ghost"` "Skip for now". Both lead to `/dashboard`. Keyboard order: Country, City, Area, Save and continue, Skip for now.

| State               | Behaviour                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading (reference) | Country select `disabled` with one option "Loading countries…" (`aria-busy`); focus starts on the first enabled field (City). Save is enabled.                           |
| Error (reference)   | Under the select: "We couldn't load the country list. You can add it later from your dashboard." with `Button variant="link" size="sm"` "Try again"; Save and Skip work. |
| Validation          | text trimmed, blank becomes `null`; over 100 characters: "Use 100 characters or fewer", tied with `aria-describedby`.                                                    |
| Saving (disabled)   | fields and both buttons disabled; Save shows `Loader2Icon` + "Saving…" and `aria-busy`.                                                                                  |
| Error (save)        | non-blocking: go to `/dashboard` and `toast.error("Your account is ready, but we couldn't save your preferences. Add them from your dashboard.")`. The account stands.   |
| Success             | all three empty: no request (same as Skip). Otherwise go to `/dashboard` and `toast.success("Preferences saved")`.                                                       |

## 5. Dashboards (`(app)/dashboard`)

Both roles: **h1 "Dashboard"**, greeting line under it (`p`, muted: "Signed in as {name}"). The old "Welcome, {name}" h1
and the page's Sign out button are removed (Sign out lives in the shell). Section headings are h2 `text-lg font-medium`.

### 5.1 Dashboard body while `/api/me` loads or fails (both roles)

| State   | Content                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | h1 "Dashboard", then `Skeleton h-5 w-48` (greeting) and `Skeleton h-28 rounded-xl`, wrapper `aria-busy="true"`, sr-only polite "Loading your dashboard…" |
| Error   | h1 "Dashboard" only. The shell Alert (2.5) carries the message and the retry/sign-in action; the body adds nothing.                                      |

### 5.2 Renter dashboard

Order: h1, greeting, quick links, **Next booking**, **Your preferences**.

- Quick links: `<nav aria-label="Quick links">` with `Button asChild` "Find a space" (`SearchIcon`) and, once the route exists,
  `Button variant="outline" asChild` "My bookings". Mobile `grid gap-3`; from `sm` `flex`.
- **Next booking** (`<section aria-labelledby="next-heading">`, h2 "Next booking"). T014 ships a **neutral** card only; T057
  owns the true empty state and the summary, in the same frame so layout does not move.

| State             | Content                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T014 (until T057) | `Card` with `CalendarIcon`, text "Find a space and book a seat by the day, week or month." and `Button asChild` "Find a space". No claim about the user's bookings.                                                                  |
| Loading (T057)    | `Skeleton h-28 rounded-xl`, section `aria-busy`, sr-only polite "Loading your next booking…"                                                                                                                                         |
| Empty (T057)      | `Card`: "You have no upcoming bookings." (`font-medium`), muted "Find a space and book a seat by the day, week or month.", `Button asChild` "Find a space"                                                                           |
| Error (T057)      | `Alert variant="destructive"` title "We couldn't load your bookings", description "Try again in a moment.", `Button variant="outline" size="sm"` "Try again"                                                                         |
| Success (T057)    | `Card`: space name (`font-medium`), "{Pass name} · {Slot name}" (`Badge variant="outline"`), "Starts {when}" (section 7), "Seat {label}", link "View booking" to `/bookings` (`text-primary underline`). Not interactive as a whole. |

### 5.3 Owner dashboard

Order: h1, greeting, then a header row with **h2 "My spaces"** and `Button asChild` "List a space" (`PlusIcon`, to
`/owner/spaces/new`; rendered once T022 ships that page), then the list.

Space card (`Card`, built by T023): name as **h3** `text-base font-medium` (not a link); "{area}, {city}"; `Badge`
"Published" or "Draft"; a `<ul aria-labelledby="{h3 id}">` (`flex flex-wrap gap-2`) with one `Button variant="outline"
size="sm" asChild` link per management page, the same set as 3.2: Details, Seats, Passes and prices, Availability, Bookings, Layout
(links appear as their pages ship). To keep names distinct, each link text is followed by sr-only " for {space name}"
("Seats for Hub One"). One tab stop per target, and no `<nav>` per card. Grid: 1 column mobile, `md:grid-cols-2`.

| State            | Content                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T014 placeholder | h2 "My spaces" and a `Card` with muted text "Your spaces will appear here." (no button until T022). Not a loading or empty claim.                                                      |
| Loading (T023)   | 2 x `Skeleton h-36 rounded-xl`, `aria-busy`, sr-only polite "Loading your spaces…"                                                                                                     |
| Empty (T023)     | `Card`: "You haven't listed a space yet." muted "Add your space's details and seats, then set pass prices to start taking bookings." `Button asChild` "List your first space" (AC 1.4) |
| Error (T023)     | `Alert variant="destructive"` "We couldn't load your spaces", "Try again in a moment.", "Try again" button                                                                             |
| Success (T023)   | cards as above                                                                                                                                                                         |

The owner dashboard has no next-booking section; owners reach the renter flows through the nav (OQ-9).

### 5.4 Breakpoints and live regions

Mobile: single column, full-width buttons. Renter dashboard from `md`: Next booking left and Your preferences right
(`md:grid-cols-2`). Loading text uses `aria-live="polite"` on the skeleton wrapper; errors `role="alert"`; empty and
success are static. Toasts (Sonner) are a polite status, never the only carrier of an outcome that has a persistent control.

## 6. Preferences editing (renter dashboard)

`useMeGet().preferences` of `null` is treated as all three fields `null`.

### 6.1 View mode

h2 "Your preferences" in a `Card`, a `<dl>`: Country (name from `/api/reference`, or "Any"), City ("Any"), Area ("Any"),
and `Button variant="outline" size="sm"` "Edit preferences". When all three are null: muted "You haven't set a preferred
location. Search starts empty." and the button reads "Add preferences".

| State                | Behaviour                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Loading (reference)  | Country value `Skeleton h-4 w-24` while `/api/reference` loads                                                      |
| Reference failed     | Show the **stored country code** (for example "IN") in place of the name; no error shown in view mode               |
| Loading / error (me) | The card follows 5.1 (skeleton lines, `aria-busy`); on error the shell Alert covers it and the card is not rendered |
| Success              | After saving: view mode, `toast.success("Preferences saved")`, focus returns to "Edit preferences"                  |

### 6.2 Edit mode (`components/preferences-form.tsx`, shared with 4.3)

Fields as 4.3, prefilled; `Label` above each. Buttons: `Button` "Save preferences", `variant="ghost"` "Cancel" (back to
view mode, focus to "Edit preferences"), `Button variant="link" size="sm"` "Clear all" (empties the fields, does not
submit). Saving all-empty sends three `null`s (clears, AC 1.2). Entering edit mode focuses the Country select (or City if
reference is still loading or failed).

If the reference list failed: the select is replaced by muted text "Country unavailable right now." with "Try again";
City and Area stay editable and a save **sends the stored country unchanged**.

| State    | Behaviour                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disabled | while saving, fields and buttons disabled; Save `aria-busy`, spinner + "Saving…"                                                                                                                                                                                                |
| Error    | `PUT` failure: `Alert variant="destructive"` (`role="alert"`, `tabIndex={-1}`, receives focus) title "We couldn't save your preferences", description "Your previous preferences are unchanged. Try again." Input is kept. Owners never see this card, so 403 is not reachable. |

Layout: one column on mobile; from `md` Country, City and Area in `grid-cols-3`, buttons below.

## 7. Shared copy and format conventions (all area specs)

- **Voice**: short, plain, sentence case, second person; buttons are verb phrases. No exclamation marks. Errors say what
  happened and what to do. Never show a server `message` or `detail`.
- **Terms**: "space", "seat", "pass", "slot". Roles in the UI: "I own a space", "I need a space". "Owner" appears only in
  the owner-gate copy ("This page is for space owners.").
- **Pass names**: "Day pass", "Weekly pass", "Monthly pass" (1, 7 and 30 consecutive days; always show the end date beside
  a weekly or monthly pass).
- **Slot names**: derived from `slot_kind` in **`lib/format.ts`**, the one source: `day` "Day slot", `night` "Night slot",
  `full_day` "24-hour slot", `working_hours` "Working hours". With times, "Day slot, 07:00 to 19:00"; overnight adds "next
  day": "Night slot, 19:00 to 07:00 next day".
- **Times and dates (FR-033)**: always in the space's zone and labelled. One helper in `lib/format.ts`:

  ```ts
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'short',
  });
  ```

  Verified output: 2026-11-03 07:00 in `Asia/Kolkata` gives "Tue 3 Nov, 07:00 GMT+5:30"; `Europe/London` in July gives "Fri
  3 Jul, 08:00 BST"; `Europe/Paris` gives "Tue 3 Nov, 08:00 CET". **Ambiguous** means the short name starts with `GMT+` or
  `GMT-` (the zone has no real abbreviation, for example `Asia/Kolkata` "GMT+5:30", `America/New_York` in winter "GMT-5"):
  then append the IANA id in muted text, for example "Tue 3 Nov, 07:00 GMT+5:30" followed by "Asia/Kolkata". Ranges show the
  zone once, at the end. Date only: the same options without time fields and **without a zone label** (a pure date has no clock time to disambiguate), adding `year: 'numeric'` when the year differs from the current year and always on confirmations. Checked: 2026-11-03 in `Asia/Kolkata` gives "Tue 3 Nov" (no year) and "Tue, 3 Nov 2026" (with year; `en-GB` inserts the comma). Times outside a space context show the viewer's
  zone, labelled the same way. Tests cover several zones and a DST day.

- **Money**: API `{ amount, currency }` formatted with `Intl.NumberFormat('en', { style: 'currency', currency,
currencyDisplay: 'symbol' })`, always, never hand-built: "₹1,500.00", "$1,500.00", "¥1,500". **Amended (T018, OQ-F):** one
  helper, `formatMoney` in `lib/format.ts`, adds fraction-digit options so a price is never rounded (a JPY "1500.50" shows
  "¥1,500.50"); the rule is in ui/02 section 8.3. Prices read "₹1,500.00 per day pass". Savings: "Save ₹300.00 (17%)", whole-number percent, text only.
- **Counts**: "1 seat", "12 seats", "No seats yet".
- **Problem copy approach (`lib/marketplace-problems.ts`)**: map `problem.type` (prefix `urn:bseat:problem:`) plus an
  `action` key to `{ title, description }`, same shape and `ProblemAlert` pattern as `booking-problems.ts` (001 ui.md
  section 6). Titles state the outcome; descriptions give the next step and at most one inline link; interpolate only values
  the client holds (seat label, space name, zone). Fallbacks by status: 400 and 422 "Check the details and try again."; **401
  "Your session has ended" with description "Sign in again to continue." and a "Sign in" link to `/sign-in?next={current
path}` via `safeNext`** (the same Alert as 2.5 and 001); 403 "You don't have access to this."; 404 "We couldn't find that.
  It may have been removed."; 409 "That changed while you were working. Reload and try again."; network "Check your
  connection and try again."; 5xx "Something went wrong on our side. Try again in a moment." Each area spec adds its own
  types; this one adds none.
- **Toasts** only for confirmations of non-blocking, repeatable actions. Outcomes the user must act on use an inline Alert
  that receives focus.

## 8. Accessibility and contrast

- One `<h1>` and one `<main id="main">` per page, no skipped heading levels (dashboard: h1, h2, h3). Landmarks: `header`,
  `nav` ("Main", "Space management", "Quick links", each uniquely labelled), `main`.
- Keyboard: root skip link, brand, nav links, Sign out, then the page. Escape closes the mobile panel; no trap.
- Focus ring on every control: `outline-ring` solid, 7.69 / 7.13 against `background` and `card` (needs 3:1); shadcn's halo is
  supplementary (tokens.md F1).
- Colour pairs come only from tokens.md: `foreground` and `muted-foreground` on `background`, `card`, `muted`;
  `secondary-foreground` on `secondary`; `primary` on `background`; `success` on `card`; `destructive` on `card`;
  `primary/5` tint with `foreground`. Field and tile borders follow tokens.md F2 (a visible label always carries meaning).
- Status and role are always text ("Draft", "Published", "I own a space"), never colour alone.
- Reduced motion: no animation beyond shadcn defaults and the spinner.
- axe (qa): `/sign-up` (step 1 with the role error, step 2, "Check your email"), `/dashboard` (renter and owner; loading,
  empty, error), mobile menu open; screenshots at 375, 768 and 1280 px.

## 9. Existing code T014 and T015 must update

- `apps/web/e2e/auth.spec.ts` (sign-up journey, lines 16 and 18): choose a role before "Create account"; the heading
  assertion "Welcome, Ada Lovelace" becomes the h1 "Dashboard" plus the "Signed in as Ada Lovelace" line; Sign out is the
  shell's button.
- `apps/web/src/components/welcome.tsx`: shows raw `error.message` (violates section 7). Replace it with the greeting line
  and the 5.1 states, or retire it.
- `apps/web/src/app/(auth)/sign-in/page.tsx` and `sign-up/page.tsx`: add the server-validated signed-in redirects (section 4); in sign-up drop the `accountType: 'renter'` bridge; `sign-up/page.test.tsx` and
  `auth-form.test.tsx` need the role field and the "Check your email" case.
- `apps/web/src/app/(app)/book/page.tsx` and its test: drop the back link and cross-link (2.1).
- `apps/web/src/proxy.ts`: matcher per T014.

## Open questions

None blocking. Assumption to confirm: T014 hides "List a space" and "My bookings" until T022 and T057 ship their routes.
