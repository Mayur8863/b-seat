# UI 01: Owner Photos section

**Task**: T011 · **Used by**: T013 (queue model), T014 (page, list, queue), T015 (description, leave guard), T025 (reorder, delete), T029 (limit), T016, T026, T029 (qa)
**Spec**: US1, US3, US4, AC 1.1 to 1.9, AC 3.1 to 3.6, AC 4.1 to 4.4, FR-001 to FR-010, FR-012, FR-015, FR-020, FR-026
**Contracts**: [photos.md](../contracts/photos.md), [README problem types](../contracts/README.md#problem-types-new)
**Inherits** [002 ui/01](../../002-space-marketplace/ui/01-shell-accounts.md): touch targets (section 1), page frame and link states (2.1, 2.4), sub-nav (3.2), copy and conventions (7), contrast (8); and [002 ui/02](../../002-space-marketplace/ui/02-owner-listing.md): field pattern (2.1), control states (2.2), alerts, toasts and live regions (2.3), `[spaceId]` layout (5). Only differences are written here.

## 1. Components and build map

Reuse from `@bseat/ui`: Alert, AlertDialog, Badge, Button, Card, Label, Skeleton, Sonner, Textarea.
Icons (lucide, always `aria-hidden` beside text): `ImageIcon`, `ImagePlusIcon`, `ClockIcon`, `Loader2Icon`, `CircleCheckIcon`,
`CircleAlertIcon`, `BanIcon`, `InfoIcon`, `ArrowLeftIcon`, `ArrowRightIcon`, `StarIcon`, `Trash2Icon`, `GripIcon`, `XIcon`. If a name is
missing in the pinned lucide version, use the nearest icon; the text carries the meaning.

**One shadcn component to add (frontend-dev, T014; no token change):**

- `progress` (Radix `Progress`, renders `role="progressbar"`). Track `bg-primary/20`, fill `bg-primary`, `h-2 rounded-full`. The
  percentage is always written as text beside it, so the track needs no 3:1 boundary. Every instance gets `aria-label`
  ("Uploading {file name}") and `value`.

| Screen           | Route                                   | Task             |
| ---------------- | --------------------------------------- | ---------------- |
| 3. Photos page   | `/owner/spaces/[spaceId]/photos`        | T014, T015, T025 |
| 4. Upload queue  | inside the Photos page                  | T013, T014       |
| 5. Photo card    | inside the Photos page                  | T014, T015, T025 |
| 6. Delete dialog | from a photo card                       | T025             |
| 7. Leave dialog  | when navigating with unfinished uploads | T015             |

**Mobile controls.** As 002 ui/02 section 1: every Button and link `max-sm:min-h-11`; the Add photos button is full width below `sm`.

## 2. Navigation and frame

- **Nav position.** "Photos" is the **second** item of the space sub-nav (002 ui/01 3.2): Details, **Photos**, Seats, Passes and
  prices, Layout, Availability, Bookings. Photos are the first thing an owner adds after the details. `space-manage-nav.tsx`
  `MANAGE_LINKS` gets `{ label: 'Photos', segment: '/photos' }` in that slot. `aria-current="page"` and the style are as 3.2.
- **Frame.** The `[spaceId]` layout owns `<main id="main">` and the header, sub-nav and the `max-w-6xl` frame (002 ui/05). The
  Photos page renders **no `<main>`** and uses the full `max-w-6xl` frame, like every other tab. Its first element is the
  `<h1>`: "Photos".
- Page `<title>`: "Photos · {space name}" (same pattern as the other tabs).

## 3. Photos page

### 3.1 Structure and DOM order (this is the tab order)

1. `<h1>` "Photos".
2. Muted visibility line (3.2).
3. Counter line and the **Add photos** button (3.3, 3.4).
4. Page Alert slot (focus target for list-level failures: session ended, reorder stale, delete failed, list load).
5. **Uploads** section (`<section aria-labelledby="uploads-heading">`, h2 "Uploads"), only while the queue has rows (section 4).
6. **Your photos** section (`<section aria-labelledby="photos-heading">`, h2 "Your photos"): the empty state (3.5) or the photo
   list (section 5).
7. One sr-only live region (`role="status" aria-live="polite" aria-atomic="true"`) mounted at page load, never unmounted (3.7).

Layout: single column. Header row (h1 left, Add photos right) from `sm`; below `sm` the button is full width under the counter.

### 3.2 Visibility line

Muted `text-sm`, under the h1. Read from the space status (shared cache with the layout).

| Space status       | Text                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Published          | "Renters see these photos on search results and on your listing page."                           |
| Draft, Unpublished | "Renters can't see this space yet, so they can't see its photos either. Your photos stay saved." |

Photos are never required to publish (FR-012), so this line never says "required" and the Publishing card is unchanged.

### 3.3 Counter

`<p id="photo-count">`: "{n} of 10 photos" ("0 of 10 photos", "1 of 10 photos", "7 of 10 photos"), `font-medium`. Below it, muted:
"You can add {r} more." (r = room, see below), or nothing at 10.

**Room** = 10 − added photos − queue rows that are waiting, uploading or processing. The counter counts **added** photos only. Room is
used for the selection rule (3.4) and the "You can add {r} more." line. It is not announced on every change; the live region (3.7)
carries outcomes.

### 3.4 Add photos control and limit states

- `Button` "Add photos" with `ImagePlusIcon`, always visible, same place in every state. It opens the native file picker through a
  visually hidden `<input type="file" multiple accept="image/jpeg,image/png,image/webp">` (`class="sr-only"`, `tabIndex={-1}`,
  `aria-hidden="true"`, no label of its own because the Button is the control). Focus returns to the Button after the picker closes.
- Hint under the counter, muted, always shown (also states the rules): "JPEG, PNG or WebP, up to 10 MB each. The longest side must be
  at least 800 pixels." This is the one place that repeats the rules outside the empty state.
- **Selection rule (FR-004).** The chosen files are checked in the order given. The first `r` that pass the client pre-check (4.3)
  are queued as `waiting`. Every file beyond `r` is queued as **not added** ("this space already has 10 photos", section 4.2). Files
  that fail the pre-check become `failed` rows and do not use up room.
- **At 10 photos (AC 4.2, FR-004).** The button is `aria-disabled="true"` (not `disabled`, so it stays focusable and readable), shown
  at `opacity-50`, with `aria-describedby="photo-limit-note"`; pressing it does nothing. Directly under the counter an `Alert`
  (default variant, `InfoIcon`, `role="status"`, not focused, `id="photo-limit-note"`): title "This space has the maximum of 10
  photos", description "Delete a photo to make room for another." The meaning is the text, not the dimming.
- **While every free slot is taken by queued files** (room 0 but fewer than 10 added): the button is `aria-disabled` the same way,
  with `aria-describedby` pointing at "You can add 0 more. Wait for uploads to finish or cancel one." (muted line, replaces the "You
  can add {r} more" line).
- **No `disabled` use** other than where 002 ui/02 2.2 allows (a request in flight).

### 3.5 States of the page

| State    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | h1, visibility line, counter, Add photos, queue (if any), the list.                                                                                                                                                                                                                                                                                                                                  |
| Hover    | Add photos as 01 2.4 (`primary/80`, 4.56 / 5.33). Photo cards do not change; their buttons hover as 002 ui/02 2.2.                                                                                                                                                                                                                                                                                   |
| Focus    | Solid `outline-2 outline-offset-2 outline-ring` on every Button (7.69 / 7.13 on `background`, `card`). The hidden file input is never focused.                                                                                                                                                                                                                                                       |
| Disabled | `aria-disabled` Add photos at the limit (3.4). While a reorder, delete or description save is pending, the other reorder and delete buttons ignore presses (`aria-disabled`, so a focused button does not lose focus).                                                                                                                                                                               |
| Loading  | h1 stays. Counter `Skeleton h-5 w-28`, `Skeleton h-9 w-32` for the button, then `Skeleton h-28 rounded-xl` x 3 in the list slot. Wrapper `aria-busy="true"`, sr-only polite "Loading photos…". Add photos is not rendered until the list has loaded (the room is unknown).                                                                                                                           |
| Empty    | `Card` (section "Your photos", `ImageIcon`): title (`font-medium`) "Add photos of your space", muted "Photos help renters choose. The first photo is the cover on search results." and muted "JPEG, PNG or WebP, up to 10 MB each, at least 800 pixels on the longest side. Up to 10 photos." The button is the header's Add photos (the card has no second button). Counter reads "0 of 10 photos". |
| Error    | `Alert variant="destructive"` in the list slot, title "We couldn't load your photos", description "Try again in a moment.", `Button variant="outline" size="sm"` "Try again" (refetch). 401 and network use the 002 ui/02 section 9 fallbacks. The layout's 404 state covers a missing space.                                                                                                        |
| Success  | The list (section 5). After any change the counter, list and live region (3.7) agree.                                                                                                                                                                                                                                                                                                                |

If the list is empty **and** the queue has rows, the empty Card is not shown (the Uploads section is the content; the "Your photos"
section shows the Card again only when the queue is empty and there are still no photos).

### 3.6 Refreshing photo addresses

The list response carries `photoUrlsExpireAt`. The page refetches the list silently at `photoUrlsExpireAt − 2 minutes` (never sooner
than 5 s from now), and once when any thumbnail fires `error`. A refetch must not reset description drafts, queue rows, focus or
scroll: rows are keyed by photo id and drafts live in the form state, not the query data. A thumbnail that already loaded keeps its
old URL until the browser needs it again; a fresh URL is used for rows that have not loaded or have errored. If the refetch
fails, nothing is shown: the next image error shows the thumbnail error state (5.4).

### 3.7 Live region (all announcements)

One polite region, `aria-atomic`, text replaced (not appended) at most once per 500 ms; messages that arrive in that window are joined
with a space. **Percentages are never announced** (the progressbar has `aria-valuenow` for on-demand reading).

| Event                      | Message                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Files queued               | "{n} photos queued." / "1 photo queued."                                                                            |
| Files not added (limit)    | "{n} photos not added: this space already has 10 photos." / "1 photo not added: …"                                  |
| A file fails the pre-check | "{file name} was not added. {reason}"                                                                               |
| A file is added            | "Photo {k} of {total} added." (k = number added so far in this selection, total = files that were queued to upload) |
| A file fails after upload  | "{file name} failed. {reason}"                                                                                      |
| A file is cancelled        | "{file name} cancelled."                                                                                            |
| Retry                      | "{file name} is waiting to upload again."                                                                           |
| Selection finished         | "{a} of {total} photos added." or "{a} added, {f} failed." (only when some did not succeed)                         |
| Reorder                    | "Photo moved to position {p} of {n}." and, when p is 1, " It is now the cover."                                     |
| Description saved          | "Description saved for photo {p}."                                                                                  |
| Photo deleted              | "Photo deleted. {n} of 10 photos." / "Photo deleted. No photos left."                                               |
| Photos refreshed (expiry)  | silent                                                                                                              |

`{reason}` is the row's reason text from section 4.2, without the leading label.

## 4. Upload queue (Uploads section)

`<ul aria-label="Uploads">`, rows in selection order, newest selection appended below older rows. Heading row: h2 "Uploads" and, when
any row is finished (added, not added, cancelled), `Button variant="ghost" size="sm"` "Clear finished" (removes those rows; failed rows
stay until retried or dismissed). When the last row goes, the section unmounts and focus moves to Add photos.

### 4.1 Row anatomy

`<li>`, `rounded-lg border p-3`, `grid gap-2`. Line 1: file name (`font-medium`, `truncate` on one line from `sm`, `break-all` below
`sm`) and muted size ("2.4 MB"). Line 2: the state (4.2) with its icon, then the progress (uploading only). Line 3 (mobile) or the right
end of the row (`sm:grid-cols-[1fr_auto]`): the row's buttons. The original file name is shown only to its owner here. It is never sent
to renters (FR-015).

### 4.2 Row states

| State             | Visible text and icon                                                  | Buttons                                                          | Extras                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Waiting           | `ClockIcon` "Waiting"                                                  | Cancel                                                           | At most 2 files upload at once; the rest wait their turn in selection order.                                                 |
| Uploading         | `Loader2Icon` (spins with `motion-safe`) "Uploading {p}%"              | Cancel                                                           | `Progress` `value={p}`, `aria-label="Uploading {file name}"`, `max-w-xs` from `sm`, full width below. Updated visually only. |
| Processing        | `Loader2Icon` "Processing…" (all bytes sent, waiting for the response) | none (cancel is offered only while waiting or uploading, AC 1.5) | No progressbar. `aria-busy="true"` on the row.                                                                               |
| Added             | `CircleCheckIcon` `text-success` "Added"                               | none (Clear finished removes it)                                 | The photo is in the list at its position. The row keeps the text so the outcome is never colour or toast only.               |
| Failed            | `CircleAlertIcon` `text-destructive` "Failed: {reason}" (4.4)          | Retry (when the reason is retryable, 4.4), Dismiss               | Reason text is `text-destructive` on `card` 5.43 / 6.15.                                                                     |
| Not added (limit) | `BanIcon` "Not added: this space already has 10 photos."               | Dismiss                                                          | Muted text colour with the icon and the word "Not added"; not an error, no retry (deleting a photo does not auto-start it).  |
| Cancelled         | `BanIcon` "Cancelled"                                                  | Dismiss                                                          | Counts toward nothing (AC 1.5).                                                                                              |

Buttons: `Button variant="outline" size="sm"`. Each has an sr-only suffix " {file name}" ("Cancel photo-3.jpg"). Cancel and Retry
transitions keep focus on the row: after **Cancel** or **Dismiss** focus moves to the next row's first button, else the previous
row's, else Add photos. After **Retry** focus stays on the row (its Retry button is replaced by Cancel, focus moves to Cancel).

Failure of one file never changes another row (FR-005). A failed or cancelled row leaves nothing in the list and nothing in the count
(FR-006). A row that turns `added` appears in "Your photos" at its position in the same render.

### 4.3 Client pre-check (before any upload; instant `failed` row, no request)

| Check                                            | Reason text                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Type not `image/jpeg`, `image/png`, `image/webp` | "This isn't a JPEG, PNG or WebP photo. iPhone HEIC photos need converting first." |
| Size over 10 MB (10 485 760 bytes)               | "This photo is over 10 MB. Choose a smaller one."                                 |

The server judges the format by content and stays the authority; a file named `.jpg` that is a PDF passes the pre-check and fails at
the server with the 415 copy.

### 4.4 Problem copy (`lib/photo-problems.ts`, as 002 ui/01 section 7)

The web shows these words, never the API `title` or `detail`. `{type}` is after `urn:bseat:problem:`. Row text is "Failed: {reason}"
unless the "Row state" says otherwise.

| `type` (status)                        | Row state                    | Reason text                                                                                        | Retry |
| -------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| `photo:limit-reached` (409)            | Not added (limit)            | "Not added: this space already has 10 photos." (the server won the race, AC 4.4; refetch the list) | no    |
| `photo:too-large` (413)                | Failed                       | "This photo is over 10 MB. Choose a smaller one."                                                  | no    |
| `photo:unsupported-format` (415)       | Failed                       | "This isn't a supported photo. Use a JPEG, PNG or WebP photo that isn't animated."                 | no    |
| `photo:dimensions-out-of-range` (422)  | Failed                       | "The longest side must be 800 to 12,000 pixels, up to 50 megapixels."                              | no    |
| `photo:unreadable` (422)               | Failed                       | "This file couldn't be read as an image."                                                          | no    |
| `photo:busy` (503, with `Retry-After`) | Failed                       | "We're busy right now. Try again in a moment."                                                     | yes   |
| `network` (status 0, or a bare 408)    | Failed                       | "Connection lost. Check your connection and try again."                                            | yes   |
| `http-401`                             | Failed (all unfinished rows) | "Your session ended. Sign in again, then add the photo again."                                     | no    |
| `http-403`                             | Failed                       | "You can't add photos to this space."                                                              | no    |
| `http-404`                             | Failed                       | "We couldn't find this space."                                                                     | no    |
| `validation` (400) and anything else   | Failed                       | "Something went wrong. Try again."                                                                 | yes   |

Rows that cannot be retried only offer Dismiss: retrying would send the same bytes to the same refusal. A **401** also shows one page
Alert (focused, destructive): title "Your session has ended", description "Sign in again to keep adding photos. Photos already added are
saved.", link "Sign in" (`/sign-in?next=/owner/spaces/{id}/photos`, through `safeNext`). The leave guard (7) does not trigger for
this link once no row is unfinished.

### 4.5 Queue states

| State    | Behaviour                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Default  | Rows as 4.2.                                                                                                          |
| Hover    | Buttons as 002 ui/02 2.2. Rows do not change.                                                                         |
| Focus    | Buttons only. Rows and progressbars are not focusable.                                                                |
| Disabled | n/a. Buttons are not disabled; at most one is hidden by state.                                                        |
| Loading  | Waiting, uploading, processing rows (4.2).                                                                            |
| Empty    | The section is not rendered.                                                                                          |
| Error    | Failed rows (4.4). A 401 adds the page Alert.                                                                         |
| Success  | Added rows, then the live summary "3 of 3 photos added." Focus does not move (the owner may be typing a description). |

## 5. Photo list (Your photos)

`<ol aria-label="Photos in order">`: one `<li>` per photo, in position order. Above it, muted `text-sm`: "The first photo is the cover.
Describe each photo for people who use screen readers. The description is also shown to renters as the caption."

Layout (list of cards): 1 column below `md`; `md:grid-cols-2`; `lg:grid-cols-3`, `gap-4`. DOM order is position order, so the tab
and reading order is the same at every breakpoint.

### 5.1 Card anatomy

`Card`, `<li>` with `<article aria-labelledby="photo-{id}-heading">`, `p-3`, `grid gap-3`.

- **Thumbnail**: the `card` variant (640 × 480), `aspect-[4/3]`, `rounded-lg`, `object-cover`, `bg-muted` behind it, `alt` = the API `altText`.
  Below `md` it is a fixed `w-28` thumbnail at the left of the header block; from `md` it is full card width above the text.
- **Header**: h3 "Photo {position}" (`font-medium`, `id="photo-{id}-heading"`, `tabIndex={-1}`) and, for position 1, `Badge` "Cover"
  (`variant="default"`; primary-foreground on primary 7.37 / 7.88). The word is the meaning; no colour-only cover cue. Muted
  "{position} of {n}".
- **Description form** (5.2).
- **Order buttons** (5.3), then **Delete**.

### 5.2 Description (T015)

RHF + Zod; `<form noValidate>` per card; draft kept per photo id.

- `Label` "Description (optional)" with sr-only " for photo {position}", `Textarea` `rows={2}`, `maxLength` not set (so the over-limit
  error can show). Hint `<p id="photo-{id}-hint">` muted: "Shown as the caption and read aloud by screen readers. Empty uses \"{space
  name} photo {position}\"." Error `<p id="photo-{id}-error" class="text-destructive text-sm">`. `aria-describedby` lists only the ids
  that exist (002 ui/02 2.1). `aria-invalid` on error.
- Text is trimmed before validation. Empty is allowed (it clears the description).
- Button `Button variant="outline" size="sm"` "Save description". Never disabled for validation.
- Errors: over 150 after trimming "Use 150 characters or fewer" (nothing is sent). A 400 from the API: "Use plain text only." (control or
  hidden characters) or, unmatched, "Check the description and try again."
- Pending: "Saving…", `aria-busy`, textarea and button disabled. Success: inline `<p role="status">` with `CircleCheckIcon`
  (`text-success`) "Description saved" next to the button, removed when the text changes; the form resets to the returned photo; the live
  region says "Description saved for photo {p}." Failure (not 400): page Alert "We couldn't save that description" with the
  002 ui/02 section 9 fallback copy; the draft is kept.
- A reorder never discards a draft. After a save, `altText` (and the thumbnail `alt`) update from the response.

### 5.3 Reorder controls (T025, FR-009)

Three buttons per card, `Button variant="outline" size="sm"`, `flex flex-wrap gap-2`, each with an sr-only " photo {position}" suffix:

| Button       | Icon             | Shown when   | Result                        |
| ------------ | ---------------- | ------------ | ----------------------------- |
| Move earlier | `ArrowLeftIcon`  | position > 1 | swaps with the previous photo |
| Move later   | `ArrowRightIcon` | position < n | swaps with the next photo     |
| Make cover   | `StarIcon`       | position > 1 | moves to position 1           |

With one photo, **no** reorder controls render (spec edge case). A button that does not apply is omitted, not disabled, so no dead
control sits in the tab order.

- **Behaviour.** One press = one `PUT …/photos/order` with the full new order. The list reorders **at once** (optimistic); a failure
  restores the old order and shows the Alert in 5.5. While the request is pending, all reorder and delete buttons ignore presses
  (`aria-disabled`).
- **Keyboard order** inside a card: description Textarea, Save description, Move earlier, Move later, Make cover, Delete. Enter and
  Space activate buttons. No shortcut keys, nothing the owner has to learn.
- **Focus after a move.** The moved card stays under the owner's focus: focus moves to the **same button** on the card's new
  position; if that button is no longer shown (Move earlier at position 1, Make cover at position 1), focus moves to the card's first
  button that is shown (Move later). Focus never goes to `body`. The card scrolls into view with `block: 'nearest'`.
- **Announcement** (3.7): "Photo moved to position 2 of 7." After "Make cover": "Photo moved to position 1 of 7. It is now the cover."
  The Cover badge and the h3 numbers update, so the new order is visible too.
- **Pointer drag (optional enhancement).** A `GripIcon` handle on the thumbnail (`aria-hidden`, not focusable, pointer only,
  `touch-action: none` on the handle so the page still scrolls elsewhere) lets a mouse or touch user drag a card to a new position.
  A 2 px `bg-primary` line shows the drop position. Releasing sends the same `PUT`. The buttons above are the required path and
  carry all announcements; if drag costs more than the rest of T025 combined, ship without it (FR-009 is met by the buttons).
- **Stale order** (409 `photo:order-stale`): the list is refetched, and the page Alert (focused, `variant="destructive"`) says title
  "These photos changed" description "Another tab or device changed them. The list is up to date; try that change again."

### 5.4 Thumbnail states

| State   | Behaviour                                                                                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | `bg-muted` box (`motion-safe:animate-pulse`) of the same 4:3 shape, so nothing shifts.                                                                                                                               |
| Error   | One automatic refetch (3.6). If still failing: the box stays `bg-muted` with `ImageIcon` and muted text "Photo unavailable" (`text-muted-foreground` on `muted` 5.50 / 6.09). The card and its buttons keep working. |

### 5.5 Delete (T025, FR-010)

`Button variant="outline" size="sm"` "Delete" with `Trash2Icon` and sr-only " photo {position}", last in the card. It opens an
`AlertDialog` (the 002 ui/02 6.1 pattern):

- Title: "Delete this photo?"
- Description: "Photo {position} will be deleted permanently. This can't be undone." Then, only when it applies, one more sentence:
  position 1 with more photos: " The next photo becomes the cover."; the only photo: " Renters will see \"No photos yet\" instead."
- Buttons: `AlertDialogCancel` "Keep photo" (initial focus), `AlertDialogAction` "Delete photo" (`buttonVariants({ variant: 'destructive' })`).
- Pending: action `preventDefault`, disabled, "Deleting…", "Keep photo" disabled, Esc ignored.
- Success: close; the card disappears and the rest close up in order; `toast.success("Photo deleted")` plus the live line (3.7), so the
  outcome is never only a toast. **Focus** goes to the h3 of the card now at the deleted position (the previous card if it was last),
  else to Add photos when none are left.
- 404 (already deleted in another tab): close, refetch, Alert "That photo was already deleted" / "The list is up to date."
- Other errors: close, page Alert (focused) "We couldn't delete that photo" with the 002 ui/02 section 9 fallback; the card stays.
- Dismissing (Keep, Esc, outside click) returns focus to that card's Delete button.

### 5.6 Card and list states

| State    | Behaviour                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Thumbnail, header, description form, order buttons, Delete.                                                                                                                                             |
| Hover    | Buttons as 002 ui/02 2.2. The card does not change.                                                                                                                                                     |
| Focus    | Solid outline on each control. The h3 is focused programmatically only (after delete) and shows no ring (`focus:outline-none` on a `tabIndex={-1}` heading is allowed; focus is announced by its text). |
| Disabled | Save description pending: that card's field and button. Reorder or delete pending: other cards' reorder and delete ignore presses (4.5, 5.3).                                                           |
| Loading  | Page skeleton (3.5). Thumbnails 5.4.                                                                                                                                                                    |
| Empty    | 3.5.                                                                                                                                                                                                    |
| Error    | 5.2, 5.3, 5.5, 5.4.                                                                                                                                                                                     |
| Success  | "Description saved"; reorder and delete outcomes 5.3 and 5.5.                                                                                                                                           |

## 6. Breakpoints

| Width             | Layout                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 375 px (mobile)   | One column. Add photos full width. Queue rows stack: name and size, state and progress, then buttons (`min-h-11`). Photo cards: `w-28` thumbnail left of the header, form and buttons full width below; buttons wrap. |
| 768 px (tablet)   | Photo cards `md:grid-cols-2`, thumbnail full card width on top. Queue rows `sm:grid-cols-[1fr_auto]`.                                                                                                                 |
| 1280 px (desktop) | `max-w-6xl` frame, header row h1 left and Add photos right. Photo cards `lg:grid-cols-3`. Queue rows full width.                                                                                                      |

No horizontal scroll at 320 px: long file names `break-all`, buttons wrap, the sub-nav scrolls as in 002 ui/01 3.2.

## 7. Leaving with unfinished uploads (T015, FR-007, AC 1.9)

**Unfinished** = rows that are waiting, uploading or processing. Failed, not added, cancelled and added rows do not count.

- **Reload, close tab, external link**: the browser's `beforeunload` prompt only (its text cannot be changed).
- **In-app link or button that leaves the page** (main nav, sub-nav, the space name, dashboard links): intercept and open an
  `AlertDialog` (the 002 ui/02 6.1 pattern):
  - Title "Leave this page?"
  - Description "{n} photos haven't finished uploading. If you leave, they will be cancelled. Photos already added stay." (n = 1:
    "1 photo hasn't finished uploading. If you leave, it will be cancelled. Photos already added stay.")
  - Buttons: `AlertDialogCancel` "Stay on this page" (initial focus), `AlertDialogAction` "Leave and cancel" (destructive).
  - "Leave and cancel": abort all unfinished requests, then navigate to the intended link. Stay, Esc or outside click: close, focus
    returns to the link that was activated.
- With no unfinished rows, navigation is never interrupted. A link opened in a new tab or with a modifier key is not intercepted.

## 8. Contrast and accessibility notes

- Pairs (all from tokens.md, no new pair): `foreground` and `muted-foreground` on `background`, `card`, `muted` (6.00 and up; muted on
  muted 5.50 / 6.09); `destructive` on `card` for failed rows and field errors (5.43 / 6.15); `success` on `card` for "Added" and
  "Description saved" (5.65 / 7.67); `primary-foreground` on `primary` for the Cover badge (7.37 / 7.88); solid focus outline 7.69 / 7.13.
- No colour-only meaning: every row state is icon plus word (Waiting, Uploading 42%, Processing, Added, Failed, Not added, Cancelled);
  Cover is the word "Cover"; the limit is a sentence; the dimmed Add photos has its reason beside it. Progress is also the percentage text.
- `aria-disabled` (not `disabled`) is used on Add photos at the limit and on in-flight reorder and delete buttons so keyboard focus is
  kept and the reason is readable.
- Headings: h1 "Photos", h2 "Uploads", h2 "Your photos", h3 "Photo {n}" per card. One `<main>`, owned by the layout.
- Live region: one polite status for the whole page (3.7). Alerts that need action are `role="alert"`, `tabIndex={-1}`, focused on
  appearance, with at most one link (002 ui/02 2.3). No `aria-live="assertive"` anywhere except through those Alerts.
- Reduced motion: only the spinner and the thumbnail pulse animate, both `motion-safe`.
- Dark theme: the same classes; nothing to add.
- qa (T016, T026, T029): axe on the Photos page in: loading, empty, 3 photos, 10 photos (limit note), queue with one row in each
  state, a failed row with Retry, delete dialog open, leave dialog open; at 375 and 1280 px, light and dark.

## 9. Decisions and open questions

None blocks the frontend tasks. Each interim below is the designer's choice; a human or architect may override it.

| Id       | Question                                                                                                                                 | Interim used here                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| OQ-T11-1 | AC 1.4 says a failed file can be retried. Is Retry meaningful for refusals the server will repeat (too large, wrong format, unreadable)? | Retry only for `busy`, `network` and unknown errors (4.4). Other failures offer Dismiss only. Easy to widen: it is a flag per type. |
| OQ-T11-2 | Photos sub-nav position.                                                                                                                 | Second, after Details (2).                                                                                                          |
| OQ-T11-3 | Is pointer drag required?                                                                                                                | No. Optional enhancement (5.3); buttons satisfy FR-009 and WCAG 2.1.1 and 2.5.1.                                                    |
| OQ-T11-4 | A drop zone for dragging files onto the page.                                                                                            | Not offered (not in the spec). The Add photos button is the only way to add.                                                        |
| OQ-T11-5 | Cancelling a photo that is `processing`.                                                                                                 | Not offered (AC 1.5 names waiting and uploading). The server may still add it; the row then shows Added.                            |

## Handoff note for frontend-dev

Build order follows tasks.md: T013 (queue reducer, states and rules in 3.4 and 4), T014 (page, list, queue UI, `progress`), T015
(description form, leave guard), T025 (reorder, delete), T029 (limit states, already in 3.4). `lib/photo-problems.ts` gets the 4.4
rows and 5.2 to 5.5 copy. The upload helper's `ApiError` type `urn:bseat:problem:network` drives the "Connection lost" row.
