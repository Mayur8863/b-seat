# UI 05: Layout editor and renter plan

**Task**: T061 · **Used by**: T064 (editor model, pure reducer), T065 (editor page), T066 (renter plan view), T067 (qa)
**Spec**: US8, AC 8.1 to 8.5, FR-029, FR-030, FR-031, FR-032, SC-007, research R-12, OQ-6
**Contracts**: [owner-operations.md](../contracts/owner-operations.md#layout-t062) (`OwnerLayout`, `SaveLayoutInput`), [listings.md](../contracts/listings.md#get-apilistingsspaceidlayout-renter-plan-t062) (`ListingLayout`, `ListingSeatAvailability`), [owner-spaces.md](../contracts/owner-spaces.md) (seat and cubicle routes), [README problem types](../contracts/README.md#problem-types-introduced-by-this-feature)
**Inherits** [01-shell-accounts.md](01-shell-accounts.md) (touch targets, link states, sub-nav, copy, contrast), [02-owner-listing.md](02-owner-listing.md) (field pattern 2.1, control states 2.2, alerts and live regions 2.3, `[spaceId]` layout 5, seat and cubicle forms and removal dialogs 7), and [03-renter-booking.md](03-renter-booking.md) (listing page 4, seat tiles 2.2, selection and review 5, copy). Only differences are written here.

## 1. Components, build map and model

Reuse from `@bseat/ui`: Alert, AlertDialog, Badge, Button, Card, Input, Label, NativeSelect, Skeleton, Sonner.
**No new shadcn component and no token change.** The grid surfaces are plain DOM (buttons positioned on a CSS grid, R-12), not `<canvas>`, so each item is focusable and axe can read it.
Icons (lucide, always `aria-hidden` beside text): `CircleCheckIcon`, `BanIcon`, `CalendarXIcon`, `CheckIcon`, `TriangleAlertIcon`, `Loader2Icon`, `ListIcon`, `LayoutGridIcon`, `XIcon`, `InfoIcon`. Kind marks on editor items use the nearest lucide icon (`ArmchairIcon` seat, `SquareDashedIcon` cubicle, `TagIcon` area).

| Screen                | Route                                           | Task       |
| --------------------- | ----------------------------------------------- | ---------- |
| 2 to 7. Layout editor | `/owner/spaces/[spaceId]/layout`                | T064, T065 |
| 8. Renter plan        | listing page seat section (`/spaces/[spaceId]`) | T066       |

The sub-nav item "Layout" is fixed (01 section 3.2). The page sits under the owner gate and the `[spaceId]` layout (02 section 5); a foreign or unknown space is the layout's 404.
Page frame `max-w-6xl`, one `<main id="main">`, one `<h1>`. **Mobile controls** as 02 section 1.

### 1.1 What is saved when (R-12)

| Action                                                                            | Saved                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Move, resize, place, remove from plan, add or delete area, rename area, grid size | **In the draft only**, until "Save layout" (`PUT …/layout`, whole geometry, `version` for concurrency). |
| Add seat, rename seat, change a seat's cubicle, delete seat                       | **Immediately**, through the seat endpoints (the seat list and the plan are the same seats, FR-029).    |
| Add cubicle, rename cubicle, delete cubicle (and its seats, OQ-6)                 | **Immediately**, through the cubicle endpoints.                                                         |

Every control that saves immediately says so in its hint ("Saved right away."); every control that edits the draft says "Saved with the layout." This is the only rule a user needs to learn.

### 1.2 Draft model for T064 (pure reducer, no React)

State: `{ columns, rows, version, elements[], selectedId, grabbed: { id, from: {x,y,w,h}, carried: id[] } | null, dirty }`; each element `{ id (local key), kind: 'seat'|'cubicle'|'area', seatId?, cubicleId?, label, x, y, w, h }`. Coordinates are 0-based cells; the UI shows column `x+1`, row `y+1`.
Actions and invariants (each has a unit test):

| Action                       | Rule                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `select(id)`, `clear`        | One selected item at most.                                                                                                                                                                                                                    |
| `place(kind, ref, label?)`   | Default sizes: seat 2 x 2, cubicle 6 x 4, area 6 x 4. Goes to the **first free rectangle** scanning rows top to bottom, then columns; none free returns `no-space`.                                                                           |
| `grab(id)`, `drop`, `cancel` | `grab` records `from` and, for a cubicle, `carried` = ids of seats **assigned to it** whose rectangle lies inside it now (interim, OQ-T61-3). `cancel` restores every grabbed rectangle exactly.                                              |
| `move(dx, dy)`               | Clamped to the grid (`blocked: edge`). Seat over another seat, cubicle over another cubicle, area over another area: refused (`blocked: overlap`, with the other item's name). Other kinds may overlap. Carried seats move by the same delta. |
| `resize(dw, dh)`             | Width and height at least 1, right and bottom edges inside the grid, same overlap rule. Resizing is by growing or shrinking the right and bottom edges (the origin does not move).                                                            |
| `setRect(id, {x,y,w,h})`     | The form path; the same rules and the same `blocked` reasons as `move` and `resize`.                                                                                                                                                          |
| `renameArea(id, label)`      | 1 to 40 characters after trim (matches `SaveLayoutInput`). Seat and cubicle names are not reducer state (API).                                                                                                                                |
| `removeFromPlan(id)`         | Deletes the element; the seat or cubicle returns to the "Not on the plan" list. For a cubicle, its seats stay placed.                                                                                                                         |
| `deleteArea(id)`             | Removes an area for good (areas exist only in the layout).                                                                                                                                                                                    |
| `setGrid(columns, rows)`     | 10 to 80 each. Refused (`blocked: items-outside`, with the first column or row that is cut) when an element would end outside.                                                                                                                |
| `validate()`                 | Returns the list of problems: seat outside its cubicle's rectangle (only when that cubicle is on the plan), element outside the grid, zero elements. Never throws. The UI shows these before a save request (6.2).                            |
| `toSaveInput()`              | `SaveLayoutInput` (at most 600 elements, `label` only for areas, sorted by `(y, x, kind, id)` so the payload is stable).                                                                                                                      |

## 2. Editor structure and DOM order (T065)

h1 "Layout". Muted "Draw your floor plan. Renters see it once you save, and can always switch to the seat list." then "Saved right away: adding, renaming and deleting seats and cubicles. Saved with the layout: positions, sizes and areas."
Data: `useOwnerOperationsGetLayout`, the seat and cubicle queries of T024 (names, assignments, the "not on the plan" list), `useOwnerOperationsSaveLayout`, the seat and cubicle mutation hooks.

Tab order (DOM order) from the top of `main`:

1. **Toolbar** (`<div role="toolbar" aria-label="Layout actions">`, wrapping flex): the **view switch** (below `md` only, 2.3), the **Grid size** fieldset (Columns, Rows), `Button` "Save layout", `Button variant="outline"` "Discard changes" (only when the draft differs from the saved layout), and the status text.
2. **Floor plan** (3), one tab stop (roving). Keyboard help `<details>` right after it.
3. **Selected item** panel (4).
4. **Add to the plan** form (5).
5. **Not on the plan** list (5.4).
6. **All items** list (5.5), the full form alternative.

From `lg`: a two-column grid `lg:grid-cols-[1fr_20rem] gap-6`: the floor plan (and the keyboard help) on the left, items 3 to 5 stacked in the right column; "All items" full width under both. The DOM order above does not change. Below `lg` one column in that order.

### 2.1 Toolbar

- **Grid size** (`fieldset`, legend "Grid size"; muted hint "Squares across and down. 10 to 80."): two `Input type="number" inputmode="numeric"` "Columns" and "Rows" (`min` 10, `max` 80, `w-24`), defaults **40 x 30** (R-12 proposal, adopted). Commit on blur or Enter into the draft. Errors (field errors): "Use a number from 10 to 80." · "Items extend past column {n}. Move them first." · "Items extend past row {n}. Move them first."
- **Save layout** `Button`, pending "Saving…" with spinner, `aria-busy`, and the grid, panel and forms disabled. Never disabled for validation (02 section 2.2): pressing it runs `validate()` first (6.2).
- **Discard changes** opens `AlertDialog`: title "Discard your changes?", description "Positions, sizes and areas go back to the last saved layout. Seats and cubicles you added or renamed stay as they are.", buttons "Keep editing" (**initial focus**) and "Discard changes" (destructive). Success: draft resets, focus to the grid's first item (or the grid region), toast "Changes discarded".
- **Status** (`<p role="status">`, always present): "Unsaved changes" (muted, `CircleIcon` is not used; text only) when dirty, "All changes saved" (`CircleCheckIcon` `text-success`) after a save or when clean and `version` > 0, empty at version 0 with no edits. Text changes, so colour is never the signal.
- A `beforeunload` prompt guards a dirty draft (browser text). In-app navigation away from a dirty draft opens the same `AlertDialog` with title "Leave without saving?", description "Your positions, sizes and areas haven't been saved.", buttons "Keep editing" (initial focus) and "Leave page" (OQ-T61-5).

### 2.2 First use

`version === 0` and no elements: above the grid, a `Card` (`InfoIcon`) "You haven't drawn a plan yet." muted "Add a seat or place one from the list, then save. Until you save, renters see the seat list only." It disappears once an element exists. (AC 8.2, AC 8.5.)

### 2.3 Small screens (below `md`)

The editor defaults to the **form path**. A group `<div role="group" aria-label="Layout view">` of two buttons with `aria-pressed`: "List view" (`ListIcon`, pressed by default) and "Grid view" (`LayoutGridIcon`). List view shows items 3 to 6 only; Grid view shows the plan too (horizontal and vertical scroll inside its region, 3.1). Pointer editing works on a phone but the form path is the supported way there; text under the switch: "Positions are easiest to set with the list and the form on a small screen." From `md` both are always shown and the switch is `hidden` (CSS only, it leaves the accessibility tree).

## 3. Floor plan surface

### 3.1 Region and cells

`<div role="region" aria-label="Floor plan, {columns} by {rows} squares" tabIndex={0}>` with `overflow-auto max-h-[70vh] rounded-xl border bg-card`. (The scroll region is itself focusable so keyboard users can scroll an empty or large plan. Items are inside.)
Inside, `<div role="group" aria-labelledby="plan-label" aria-describedby="plan-help">`: a CSS grid of `columns x rows` cells, **cell 24 px** (so the default 40 x 30 plan is 960 x 720 px and scrolls inside the region on small screens; items snap to cells). The surface background is the grid itself: a repeating `linear-gradient` using `var(--border)` lines (decorative: cell coordinates are exposed as text, so the 1.26:1 line is exempt, tokens.md F2). Each item is an absolutely positioned `<button type="button">` (`left/top/width/height` from `x/y/w/h` times the cell size), with `touch-action: none`; the page still scrolls elsewhere.
`plan-help` is the sr-only sentence "Arrow keys move between items. Space picks an item up; arrow keys then move it, Shift and arrow keys resize it, Space drops it, Escape cancels. Enter edits the name. Delete removes it from the plan." (the same words are visible in the keyboard help below).

### 3.2 Item look (tokens only)

| Item     | Look                                                                                                                                                                                                                                                                                              | Name and text                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Seat     | `rounded-md border border-muted-foreground bg-card text-card-foreground`, label `text-xs font-medium truncate` centred, seat mark icon top-left (hidden when the seat is 1 x 1). Above cubicles (`z-10`).                                                                                         | Accessible name "Seat A-1, column 3, row 4, 2 by 2 squares" (+ ", in cubicle Pod 1") |
| Cubicle  | `rounded-lg border-2 border-dashed border-muted-foreground bg-muted/40`, label `text-xs text-muted-foreground` top-left with the cubicle mark icon. Behind seats (`z-0`).                                                                                                                         | "Cubicle Pod 1, column 1, row 1, 6 by 4 squares, 3 seats"                            |
| Area     | `rounded-lg border border-muted-foreground bg-secondary text-secondary-foreground`, label `text-xs font-medium` centred with the area mark icon. `z-0`.                                                                                                                                           | "Area Meeting room, column 10, row 2, 6 by 4 squares"                                |
| Hover    | `bg-muted/50` on a seat; `bg-muted` on cubicle and area. (`muted-foreground` on `muted/50` over `card` is 5.75 / 6.68.)                                                                                                                                                                           | none                                                                                 |
| Focus    | `outline-2 outline-offset-2 outline-ring` (7.69 / 7.13), never removed. It follows the **roving** focus (3.3).                                                                                                                                                                                    | none                                                                                 |
| Selected | `border-2 border-primary` and, on a seat or area, `bg-primary/5`; a resize handle (below). Selection and focus are separate: the focused item may differ from the selected one only while arrows move focus.                                                                                      | `aria-current="true"` on the selected item                                           |
| Grabbed  | `border-2 border-primary bg-primary/10` and a dashed outline `outline-2 outline-dashed outline-primary` on the target rectangle; the panel shows the instruction text (4). Not colour alone: the dashed outline, the changed border width, and the text "Picked up" in the panel and live region. | `aria-pressed="true"`                                                                |
| Invalid  | `border-2 border-destructive` and a `TriangleAlertIcon` in the top-right corner (`text-destructive`), plus text in the panel (6.3). Used for a seat outside its cubicle and for an element outside the grid.                                                                                      | name gains ", problem: outside cubicle Pod 1" / ", problem: outside the grid"        |
| Disabled | `opacity-50`, `pointer-events-none` while a save is running. Inactive controls are exempt from contrast.                                                                                                                                                                                          | `disabled`                                                                           |

Resize handle: a 12 px square at the selected item's bottom-right corner (`bg-primary`, `rounded-sm`), hit area 24 px (padding), `aria-hidden`, pointer only. It is not a keyboard stop: keyboard and form resizing are specified in 3.3 and 4.
A 1 x 1 seat shows no text; its accessible name and the panel carry it. Contrast: label text `card-foreground` on `card` 19.79 / 17.16; cubicle label `muted-foreground` on `muted/40` over `card` is at least 5.50 / 6.09 (the `muted` figure, so the lighter tint is above it); area text `secondary-foreground` on `secondary` 16.42 / 14.48; borders `muted-foreground` 6.00 / 7.98 on `background`; selected and focus `primary` / `ring` 7.69 / 7.13.

### 3.3 Keyboard model (decided here, finalises R-12)

**Why it differs from the R-12 sketch.** R-12 had arrows move an item. With up to 600 items, a normal Tab sequence (one stop per item) is unusable, and arrows are the natural way to **travel** between items. So the plan is **one roving tab stop**: arrows travel, and an explicit **pick up** is needed before arrows move an item. This also gives a clean cancel (Escape) and prevents accidental moves.

| Context                 | Key                       | Action                                                                                                                                                                                                   |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab / Shift+Tab         | enters or leaves the plan | The group has one tab stop (roving `tabIndex`): it lands on the selected item, else the last focused one, else the first item in reading order. Tab again leaves to the panel.                           |
| Plan, nothing picked up | Arrow keys                | Move **focus** to the nearest item in that direction (nearest centre within a 90 degree cone; none: stay and say "No item to the {direction}").                                                          |
|                         | Home / End                | First / last item in reading order (top to bottom, then left to right, then id).                                                                                                                         |
|                         | Enter or Space            | **Enter** selects the focused item and moves focus to the panel's Name field (rename and edit). **Space** selects it **and picks it up** (grab).                                                         |
|                         | Delete or Backspace       | Remove the focused item from the plan (seat or cubicle back to "Not on the plan"; an area is deleted). No dialog: it is a draft change and Discard undoes it. Focus moves to the nearest remaining item. |
|                         | Escape                    | Clears the selection (focus stays).                                                                                                                                                                      |
| Plan, item picked up    | Arrow keys                | **Move** the item one square. Hold to repeat.                                                                                                                                                            |
|                         | Shift + arrow             | **Resize** by one square: right and down grow, left and up shrink (the top-left corner does not move). Minimum 1 x 1.                                                                                    |
|                         | Space or Enter            | **Drop** (commit to the draft). Focus stays on the item.                                                                                                                                                 |
|                         | Escape                    | **Cancel** the pick-up: the item (and carried seats) return to where they were.                                                                                                                          |
|                         | Tab                       | Drops the item where it is, then leaves the plan (an item never stays picked up out of sight).                                                                                                           |
| Panel and forms         | per 4 and 5               | Ordinary form behaviour: Tab between fields, Enter submits the focused form's own button.                                                                                                                |

Blocked moves (edge, overlap) do not change the item and are announced (3.5). The same operations exist in the **Selected item** panel (4) as number fields, so no action needs the plan at all.

### 3.4 Pointer model

- **Select**: press on an item selects it (and focuses it). Press on empty cells clears the selection.
- **Move**: press and drag the item body; after 4 px of movement it follows the pointer, snapping to whole squares (`pointermove` with pointer capture). A dashed target rectangle shows where it will land; if the target is blocked (overlap) the target rectangle shows `border-destructive` and the item snaps back to its last valid square. Drop commits to the draft. **Escape** while dragging cancels. Dragging a cubicle carries its assigned seats (1.2).
- **Resize**: drag the handle of the selected item; snaps to whole squares, 1 x 1 minimum, grid edge as the maximum.
- **Place from the list**: drag a row of "Not on the plan" onto the plan; it lands with its top-left on the pointer's square (clamped to the grid, refused where it would overlap its own kind, then the message in 3.5). A row's "Place on plan" button is the non-drag path (5.4).
- **Touch**: dragging works with `touch-action: none` on items only. Below `md` the list and form path is the default (2.3).
- No hover-only information, no right-click, no double-click requirement.

### 3.5 Live-region announcements

One sr-only `role="status"` (`aria-live="polite"`, `aria-atomic="true"`) element for the whole editor, updated with the last message only. Key-repeat is coalesced: during a held arrow the region updates every 300 ms with the latest position, and once on key-up.
Dragging with a pointer announces only the drop.

| Event                               | Message                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus an item (travel)              | none beyond the item's own accessible name (3.2)                                                                                                                                |
| Select                              | "Selected seat A-1."                                                                                                                                                            |
| Pick up                             | "Picked up seat A-1 at column 3, row 4. Arrow keys move it. Shift and arrow keys resize it. Space drops it. Escape cancels." (the sentence is long once; later moves are short) |
| Move                                | "Seat A-1 moved to column 4, row 4."                                                                                                                                            |
| Resize                              | "Seat A-1 is now 3 squares wide and 2 high."                                                                                                                                    |
| Blocked at the edge                 | "Seat A-1 can't move left. It is at the edge of the grid."                                                                                                                      |
| Blocked by overlap                  | "Seat A-1 can't go there. Seat A-2 is in the way."                                                                                                                              |
| Containment broken or restored      | "Seat A-1 is outside cubicle Pod 1." / "Seat A-1 is inside cubicle Pod 1 again."                                                                                                |
| Drop                                | "Dropped seat A-1 at column 4, row 4."                                                                                                                                          |
| Cancel                              | "Move cancelled. Seat A-1 is back at column 3, row 4."                                                                                                                          |
| Place from the list or the Add form | "Seat A-1 placed at column 1, row 1. Press space to pick it up."                                                                                                                |
| No free space                       | "There is no free space for another {kind} on the grid."                                                                                                                        |
| Remove from the plan                | "Seat A-1 removed from the plan. {n} seats are not on the plan." / "Area Kitchen deleted."                                                                                      |
| Save                                | "Layout saved." (the visible status line says the same)                                                                                                                         |
| Discard                             | "Changes discarded."                                                                                                                                                            |

## 4. Selected item panel

`Card`, `<section aria-labelledby="item-heading">`, h2 "Selected item". Nothing selected: muted "Select an item on the plan or in the list to edit it." and no fields. While something is picked up: muted `InfoIcon` line "Picked up. Arrow keys move it, Shift and arrow keys resize it, Space drops it, Escape cancels." (`role="status"`).
Entering the panel by **Enter on the plan** or **Edit in a list** focuses the Name field. Field pattern 02 section 2.1; numeric fields commit on blur or Enter into the draft and show their errors on the field.

| #   | Control                                   | Label                              | Applies to    | Notes and hint                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Input`                                   | Name                               | all           | Seat: the label (1 to 20). Cubicle: the name (1 to 100). Area: the label (1 to 40). Hint: seat and cubicle "Saved right away." with `Button variant="outline" size="sm"` "Rename"; area "Saved with the layout." (no button; commits on blur or Enter).                                                                  |
| 2   | `NativeSelect`                            | Cubicle                            | seat          | "No cubicle" plus cubicles by name. Changing it assigns the seat **immediately** (hint "Saved right away."). A seat in a cubicle must lie inside that cubicle on the plan.                                                                                                                                               |
| 3   | `Input type="number"` x 2                 | Column, Row                        | all           | 1 to `columns` / `rows` (the item's right and bottom edge must fit).                                                                                                                                                                                                                                                     |
| 4   | `Input type="number"` x 2                 | Width, Height                      | all           | Squares, at least 1; hint "Squares across and down."                                                                                                                                                                                                                                                                     |
| 5   | `Button variant="outline"`                | "Remove from plan"                 | seat, cubicle | Hint "It stays in your seats and goes back to the list below." Same as the Delete key.                                                                                                                                                                                                                                   |
| 5   | `Button variant="outline"`                | "Delete area"                      | area          | Same as the Delete key.                                                                                                                                                                                                                                                                                                  |
| 6   | `Button variant="ghost"` text-destructive | "Delete seat…" / "Delete cubicle…" | seat, cubicle | Opens the 02 section 7.4 / 7.3 removal `AlertDialog` (seat: "Remove seat {label}?"; cubicle: "Remove {name}?" with the seats-too sentence). The `seat-has-future-bookings` refusal is a page Alert (section 7). On success the element is removed from the draft, toast as 02, focus to the nearest remaining plan item. |

Validation copy: "Enter a name" · "Use {max} characters or fewer" · "{Field} must be at least 1" · "The item must fit inside the grid" (Column, Row, Width, Height; names the first one that fails) · "Another seat is in that place" (overlap) · `label-taken` and `cubicle-name-taken` as field errors on Name with 02's copy ("{label} is already used by another seat. Choose a different label." / "Another cubicle already has that name. Choose a different one.").
Hint line when the selected seat's rectangle lies inside a cubicle it is **not** assigned to: muted "This seat is inside {cubicle}. Assign it?" with `Button variant="link" size="sm"` "Assign to {cubicle}" (OQ-T61-3).
Problem line (6.3) when invalid: `TriangleAlertIcon` + "Seat {label} is outside cubicle {name}. Move it inside, or choose No cubicle." (`text-destructive`, `id` referenced by the Cubicle select's `aria-describedby`).

## 5. Adding, the tray and the item list

### 5.1 Add to the plan (`Card`, h2 "Add to the plan")

One form: `NativeSelect` "Type" ("Seat", "Cubicle", "Area"; default "Seat"), `Input` "Name" (hint changes with the type: "Seat label, up to 20 characters." / "Cubicle name, up to 100 characters." / "Area name, for example Meeting room. Up to 40 characters."), `Button` "Add". Add creates the seat or cubicle through its endpoint (a request, "Adding…", fields disabled), then places it at the first free rectangle (1.2), selects it and moves focus to the plan item (roving stop). An area is created in the draft only.
Errors: "Enter a name" · "Use {max} characters or fewer" · `label-taken` and `cubicle-name-taken` as field errors on Name · `listing:seat-limit` an `Alert` inside this card (focused) "Seat limit reached" / "A space can have up to 200 seats. No seat was added." · `no-space`: an Alert (focused) "No free space on the grid" / "Make the grid bigger or move items, then add it again." Success: toast "Seat {label} added" / "Cubicle {name} added" / "Area {name} added" and the announcement of 3.5.

### 5.2 Which hooks

Seat create: the T021 seat `POST` (one seat); cubicle create: the cubicle `POST`; rename and assignment: the `PATCH`es; delete: the existing removal calls (02 section 7). The layout `PUT` never creates, renames or deletes seats or cubicles (R-12).

### 5.3 Where a seat's name comes from

Seat elements in `OwnerLayout.elements` carry `label`; areas carry their own. After any seat or cubicle mutation the layout and seat queries are invalidated together so the plan, the tray and the list agree (FR-029). A seat removed from the seat page (T024) disappears from the plan on the next load (T062 removes its element).

### 5.4 Not on the plan (`Card`, h2 "Not on the plan")

`unplacedSeatIds` joined with seat labels, plus cubicles with no element, as `<ul aria-label="Items not on the plan">`: row = label (`font-medium`), muted "Seat" or "Cubicle" (text), and `Button variant="outline" size="sm"` "Place on plan" (+ sr-only " seat {label}"). The row body is also a drag source (3.4). Pressing "Place on plan" places the item (1.2), moves focus to it on the plan, announces 3.5. If the grid is full the Alert of 5.1 appears here instead.
Count line (muted, `role="status"`): "{n} seats not on the plan" / "1 seat not on the plan" / none when zero.

| State   | Behaviour                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty   | "Every seat is on the plan." (muted) when there are seats; "You haven't added any seats yet. Add one above." when the space has none (AC 8.2). |
| Loading | `Skeleton h-10` x 3, `aria-busy`, sr-only polite "Loading seats…"                                                                              |
| Error   | `Alert variant="destructive"` "We couldn't load your seats" / "Try again in a moment." / "Try again" (02 section 7.5)                          |

### 5.5 All items (the full form alternative)

h2 "All items ({n})", `<ul aria-label="All items">`, `divide-y rounded-xl border bg-card`, reading order. Row: kind text ("Seat", "Cubicle", "Area"), name (`font-medium`), muted "column {c}, row {r}, {w} by {h}" and "Problem: outside cubicle {name}" when invalid (with the icon), and `Button variant="outline" size="sm"` "Edit" (+ sr-only " {kind} {name}"). "Edit" selects the item and focuses the panel's Name field; when the panel is closed again (Apply, Remove from plan), focus returns to that row's "Edit" (or the next row's). Anything the plan can do is reachable here and in the panel: select, move (Column, Row), resize (Width, Height), rename, remove from plan, delete, assign a cubicle, place (5.4), add (5.1) and resize the grid (2.1).

### 5.6 Action matrix (AC 8.1, AC 8.3, FR-030)

| Action                   | Pointer                             | Keyboard on the plan                                 | Form path                                                            |
| ------------------------ | ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Add seat, cubicle, area  | Add form, then drag it where wanted | Add form, then the new item is selected and focused  | Add to the plan (5.1)                                                |
| Place an unplaced item   | Drag a row onto the plan            | "Place on plan"                                      | "Place on plan" (5.4)                                                |
| Select                   | Press the item                      | Arrow keys travel, Enter selects                     | "Edit" in All items                                                  |
| Move                     | Drag the item                       | Space, arrows, Space                                 | Column and Row                                                       |
| Resize                   | Drag the handle                     | Space, Shift + arrows, Space                         | Width and Height                                                     |
| Rename                   | Select, edit the Name               | Enter, edit the Name                                 | Name (+ "Rename" for seats and cubicles)                             |
| Delete / remove          | Select, panel buttons               | Delete key (remove from plan); panel for real delete | "Remove from plan", "Delete area", "Delete seat…", "Delete cubicle…" |
| Assign a cubicle         | Select, Cubicle select              | Enter, Cubicle select                                | Cubicle select                                                       |
| Resize the grid          | n/a                                 | n/a                                                  | Columns and Rows (2.1)                                               |
| Save, discard            | Buttons                             | Buttons                                              | Buttons                                                              |
| Cancel a drag or pick-up | Escape                              | Escape                                               | n/a (nothing is held)                                                |

## 6. Saving, conflicts and containment (T065)

### 6.1 Save flow

`Button` "Save layout" runs `validate()`, then `PUT` with `version`. Pending: 2.1. **Success (200):** the draft adopts the response (`version + 1`), status "All changes saved", `toast.success("Layout saved")`, the announcement "Layout saved.", focus stays on the button. Invalidate the layout query and the owner space (so `hasLayout` in the overview, T023) and, for renters, the listing layout.

### 6.2 Client-side check

When `validate()` returns problems the request is **not** sent. An `Alert variant="destructive"` (`role="alert"`, `tabIndex={-1}`, **focused**) appears under the toolbar: title "Fix {n} items before saving" ("Fix 1 item before saving"), description "Keep every item inside the grid, and every seat inside its cubicle.", then a list of `Button variant="link"` rows "Seat A-1 is outside cubicle Pod 1" / "Area Kitchen is outside the grid" that select the item and focus it on the plan. Zero elements: title "Nothing to save yet", description "Place at least one seat on the plan, then save." (OQ-T61-4.) The Alert is removed when the list becomes empty or a save succeeds.

### 6.3 Cubicle containment feedback

A seat assigned to a cubicle is **valid** when its rectangle lies fully inside that cubicle's rectangle on the plan (a cubicle that is not on the plan imposes no check, OQ-T61-3). The editor shows the state live while the user moves or resizes: `border-destructive` plus `TriangleAlertIcon` on the seat, the panel line of section 4, the All-items row text, and the live message "Seat A-1 is outside cubicle Pod 1." Moving back inside clears all four and announces "Seat A-1 is inside cubicle Pod 1 again." Shrinking or moving a cubicle that leaves assigned seats outside marks those seats the same way (it does not move them, except when carried by a pick-up, 1.2).

### 6.4 Server refusals

| `type` (status)              | Shown as                          | Title                              | Description                                                                                                                 | Extra                                                                                                                   |
| ---------------------------- | --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `layout:stale-version` (409) | Alert under the toolbar (focused) | This layout changed                | "It was saved from somewhere else after you opened it. Reload the layout to continue. Your unsaved positions will be lost." | `Button` "Reload layout" (refetch, adopt, discard the draft, focus the plan); the draft is kept on screen until pressed |
| `layout:out-of-bounds` (422) | same                              | Items are outside the grid         | "Keep every item inside the grid, and every seat inside its cubicle."                                                       | runs `validate()` again to list the items (6.2); should not happen if the client check passed                           |
| `http-404` (save)            | same                              | We couldn't find a seat or cubicle | "One may have been removed. Reload the layout to continue."                                                                 | "Reload layout"                                                                                                         |
| `validation` (400)           | same                              | We couldn't save the layout        | "Check the details and try again."                                                                                          | unmapped; the client checks should prevent it                                                                           |

Fallbacks by status as in 01 section 7 (401 sign-in link, 403 "You don't have access to this.", network "Check your connection and try again.", 5xx "Something went wrong on our side. Try again in a moment."); the fallback title is "We couldn't save the layout". Seat and cubicle mutations use the 02 section 9.1 rows (field errors for taken names, the seat-limit Alert, the future-bookings page Alert).

## 7. Editor states (T065)

| State    | Behaviour                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Toolbar, plan with the saved items, panel (empty prompt or the selected item), Add form, "Not on the plan", "All items".                                                                                                                                                                                       |
| Hover    | 3.2 on items; buttons and links per 01 section 2.4; list rows `bg-muted/50`.                                                                                                                                                                                                                                   |
| Focus    | 3.2 and 3.3. Tab order: sub-nav, toolbar (view switch below `md`, Columns, Rows, Save layout, Discard changes), plan (one stop), keyboard help, Selected item fields and buttons, Add form, each "Place on plan", each "Edit".                                                                                 |
| Disabled | While saving: Save and Discard (pending text), the plan items, the panel and the Add form. While an Add, Rename or Delete request runs: that form's fields and button. Never disabled to hide a reason.                                                                                                        |
| Loading  | h1 and intro at once; toolbar `Skeleton h-9 w-full`; plan `Skeleton h-96 rounded-xl`; panel `Skeleton h-40 rounded-xl`; `aria-busy="true"` on the wrapper, sr-only polite "Loading layout…". The page does not mount the plan until the layout and seats have loaded.                                          |
| Empty    | 2.2 (no plan yet) or, when the space has no seats, "You haven't added any seats yet. Add one above." in "Not on the plan"; the plan and the Add form stay usable (areas and cubicles can still be drawn).                                                                                                      |
| Error    | Load failure: `Alert variant="destructive"` in place of the content "We couldn't load the layout" / "Try again in a moment." / "Try again". Save, add, rename and delete failures: 6.4 and 02 section 9.1, always an Alert that is focused, or a field error. A 404 for the space is the `[spaceId]` layout's. |
| Success  | "All changes saved" status, toasts for add, delete and save, announcements of 3.5.                                                                                                                                                                                                                             |

**Breakpoints.** Mobile (below 640): single column, list view default (2.3), buttons full width, the plan scrolls inside its region (24 px cells, items still snap). `sm` and `md` (to 1023): both views shown in one column (plan, panel, add, tray, list), numeric fields in `grid-cols-2`. `lg` and up: the two-column arrangement of section 2 (plan left, panel, Add and tray right at 20 rem, All items below).
**Keyboard help** (`<details>`, summary "Keyboard shortcuts", closed by default): the table of 3.3 as a short `<dl>` (key, action), `text-sm`.

## 8. Renter plan (T066)

On the listing page (03 section 4), inside "Choose a seat". Shown only when `Listing.hasLayout` is true **and** `GET …/layout` returned elements; a 404 or an empty `elements` means the seat list only, with no switch and no message (AC 8.5). Data: `useListingsLayout` (geometry) joined with `ListingSeatAvailability.seats` by `seatId`.

### 8.1 View switch

Above the seat group, after the count line: `<div role="group" aria-label="Seat view">` with two `Button variant="outline" size="sm"` ("Plan" with `LayoutGridIcon`, "List" with `ListIcon`) using `aria-pressed`. The pressed one is `bg-secondary text-secondary-foreground font-medium` (16.42 / 14.48) and also carries `aria-pressed="true"`; the text is the label. **Default: Plan from `md`, List below `md`** (designer call: the plan needs a minimum 24 px cell, and 2 x 2 seats are about 48 px; phones are better served by the list, and the plan stays one tap away). The switch is **always** available, so the list is always reachable (AC 8.4, FR-031). Switching keeps the selected seat and moves no focus. Changing pass, slot or date keeps the chosen view.
The List view is exactly 03 section 4.4; the Plan view is below.

### 8.2 Plan surface (read-only)

`<div role="region" aria-label="Floor plan, {columns} by {rows} squares" tabIndex={0}>`, `overflow-auto max-h-[70vh] rounded-xl border bg-card`, containing a CSS grid of `columns x rows` with a **cell of 24 to 40 px** (`max(24px, min(40px, containerWidth / columns))`; a plan that is narrower than 24 px a cell scrolls inside the region). Same positioning and decorative grid lines as 3.1.
Elements:

- **Seats** from the plan that exist in the availability response: `role="radio"` buttons inside `role="radiogroup"` `aria-labelledby="seats-heading"` (one group for the whole plan), tile content below.
- **Cubicles** and **areas**: non-interactive `div`s (`aria-hidden="true"`) behind the seats, looking as in 3.2 without hover or selected states. Their names are not lost: a seat's accessible name includes its cubicle, and an sr-only `<p>` before the plan lists the areas: "Areas on this plan: Meeting room, Kitchen." (omitted when none).
- A plan seat missing from the availability response (removed since) is not drawn. A seat in the response but **not on the plan** appears in the "Seats not on the plan" list (8.4).

**Seat on the plan** (a `button role="radio"`, positioned by `x/y/w/h`; 2.2 of ui/03 for the states, scaled down):

| Status   | Look                                                                                                                                                        | Visible content                                                               | Accessible name                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `free`   | `rounded-md border border-muted-foreground bg-card text-card-foreground`; hover `bg-muted/50`                                                               | label (`text-xs font-medium`, truncated) and `CircleCheckIcon` `text-success` | "{label}, {cubicle, }Free"                   |
| `taken`  | `rounded-md border border-dashed border-muted-foreground bg-muted text-muted-foreground`, no opacity, `aria-disabled`, not in the roving order              | label and `BanIcon`                                                           | "{label}, {cubicle, }Taken"                  |
| `closed` | as taken                                                                                                                                                    | label and `CalendarXIcon`                                                     | "{label}, {cubicle, }Closed on {start date}" |
| Selected | `border-2 border-primary bg-primary/5`; a small round badge in the top-right corner (`bg-primary text-primary-foreground`) with a `CheckIcon` (7.37 / 7.88) | as free, plus the check badge                                                 | `aria-checked="true"`                        |
| Focus    | `outline-2 outline-offset-2 outline-ring`                                                                                                                   |                                                                               |                                              |

Seats of 1 x 1 squares (24 px) show **no label**, only the icon (so the state is still icon-based); their name is in the accessible name and in the list view. The legend (8.3) explains the icons and the list view is one press away. A seat is never given its state by colour alone: icon and word (in its name) always.

**Selecting.** Press, tap, or Space on a free seat selects it exactly as in the list view (03 sections 4.4 and 5.1: the "Your selection" card fills, announcement "Seat {label} selected.", no booking yet). This is what "choosing a free seat starts the booking" means here: the card and its "Review booking" button follow. Pressing the selected seat again does nothing (radio behaviour). Taken and closed seats cannot be selected.
**Keyboard on the plan:** the radiogroup is **one tab stop** (roving) landing on the selected seat, else the first free seat in reading order. **Arrow keys move to the nearest free seat in that direction** and select it (radio behaviour); **Home / End** the first / last free seat in reading order; **Space** selects the focused seat; Tab leaves. Taken and closed seats are skipped by arrows and are still readable in browse mode. DOM order is reading order (top to bottom, left to right), so a screen reader's virtual cursor reads a logical sequence.

### 8.3 Legend

Below the plan: `<ul aria-label="Legend">` (`flex flex-wrap gap-x-4 gap-y-2 text-sm`): `CircleCheckIcon` "Free" (`text-success`), `BanIcon` "Taken", `CalendarXIcon` "Closed", a small check badge "Selected". Muted text, 6.00 / 7.98 on `background`.

### 8.4 Seats not on the plan

If any seat in the availability response has no element: h3 "Seats not on the plan" and the tiles of 03 section 2.2 (list tiles, same radio group semantics as the list view, joined to the same selection). The same group is shown in the **List** view as part of the ordinary list; in **Plan** view it appears under the legend. A selection can be made from either place and is one selection.

### 8.5 Plan states

| State    | Behaviour                                                                                                                                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Switch, plan with free, taken and closed seats, legend, "not on the plan" tiles.                                                                                                                                                                                                             |
| Hover    | Free seat `bg-muted/50`; no change on taken, closed, cubicles and areas.                                                                                                                                                                                                                     |
| Focus    | Outline on the focused free seat; Tab order: pass group, date, hide checkbox, view switch, the plan (one stop), "not on the plan" tiles (one stop), "Review booking".                                                                                                                        |
| Disabled | Taken and closed seats (see above, not dimmed). The whole plan while a booking request runs.                                                                                                                                                                                                 |
| Loading  | Layout loading: `Skeleton h-72 rounded-xl` in place of the plan, `aria-busy`, sr-only polite "Loading the floor plan…"; the List view is usable at once. Seats loading: plan seats are `Skeleton` rectangles at their positions (the geometry is known), same sr-only text "Loading seats…". |
| Empty    | No layout (404) or no elements: no switch and no plan (AC 8.5). All seats taken or closed: 03 section 4.4's "No seat is free for the whole period." card sits above the plan, and the plan still shows every seat.                                                                           |
| Error    | Layout failure other than 404: no switch; one muted `<p role="status">` "The floor plan isn't available right now. Choose a seat from the list." with `Button variant="link" size="sm"` "Try again". Seat availability failure: 03 section 4.4's Alert replaces the plan and the list.       |
| Success  | The plan; selection per 8.2. After a booking, availability refetches and the booked seat shows as Taken (03 section 5.2).                                                                                                                                                                    |

**Breakpoints.** Below `md`: List view by default; Plan view scrolls in its region (cells 24 px). `md`: plan by default, `max-w-full`. `lg`: the plan sits in the left column of the listing page (03 section 4.1) beside the sticky selection card.

## 9. Contrast and accessibility notes

- Pairs (tokens.md, no new pair): `foreground`, `card-foreground` on `card` 19.79 / 17.16; `muted-foreground` on `background`, `card`, `muted` 6.00 / 7.98, 6.00 / 7.22, 5.50 / 6.09; `secondary-foreground` on `secondary` 16.42 / 14.48; `success` on `card` for "Free" 5.65 / 7.67; `destructive` on `card` for the invalid mark and Alerts 5.43 / 6.15; `primary-foreground` on `primary` for Save and the check badge 7.37 / 7.88; `primary` on `background` / `card` for links and selected borders 7.69 / 7.13; focus outline `ring` 7.69 / 7.13 (3:1 required). Item borders use `border-muted-foreground` (6.00 / 7.98), not `border` or `input` (1.26:1, tokens.md F2). The grid lines are decorative.
- No colour-only meaning: seat state is icon plus word in the name; selected has a check badge and `aria-checked`; grabbed has a dashed outline, a heavier border and text; invalid has an icon and text; unsaved changes are words; kind (seat, cubicle, area) is a text kind in names, a different border style and a mark icon.
- Names: every item has a unique, descriptive accessible name (kind, name, position, size). Positions are always given as text.
- Roving tabindex and `aria-pressed` and `aria-current` are applied by the item component; the plan group has a label and a description; the region is focusable so keyboard users can scroll.
- Reduced motion: no animation beyond shadcn defaults and the spinner; dragging follows the pointer with no easing.
- Dark theme: the same classes; the second number of each pair is the dark value.
- qa (T067): axe on the editor (empty first use, a plan with 6 seats, 2 cubicles and an area, an item picked up, an invalid seat with the fix list, stale-version Alert, discard dialog open, list view at 375 px, loading, error) and the renter plan (plan view with free, taken and closed seats, a selected seat, list view, no-layout listing, loading, error). Screenshots at 375, 768 and 1280 px, light and dark.
  Keyboard-only runs: (1) place 6 seats, 2 cubicles and a "Meeting room" area with only the keyboard (Add form, Space and arrows, Panel), save; (2) the same with only the form path (no plan focus); (3) as a renter, choose a seat from the plan with arrows and Space and reach the confirmation. A pointer run of the same plan.

## 10. Decisions and open questions

None blocks the frontend tasks. Each interim is the designer's choice; a human or architect may override it.

| Id       | Question                                                                                                                                                                                                                                                    | Interim used here                                                                                                                                                                                                                   | Affects          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| OQ-T61-1 | R-12 says arrows move a focused item. With hundreds of items that makes Tab traversal the only way to travel.                                                                                                                                               | Decided here: one roving stop; arrows travel; Space picks up, arrows move, Shift+arrows resize, Space drops, Escape cancels, Enter renames (3.3). R-12's "designer finalises" clause.                                               | T064, T065       |
| OQ-T61-2 | Default grid size: R-12 proposed 40 x 30, adjustable from 10 to 80.                                                                                                                                                                                         | 40 x 30 at 24 px cells, adjustable (2.1). Confirmed as the proposal.                                                                                                                                                                | T062, T065       |
| OQ-T61-3 | Seats and cubicles are linked by data (`cubicleId` on the seat), not by geometry, and the server only says "a seat in a cubicle lies inside it". Does placing a seat inside a cubicle assign it, and does a cubicle that is not on the plan impose a check? | No auto-assign: a hint with "Assign to {cubicle}" (4). A cubicle not on the plan imposes no check. Moving a cubicle carries its assigned seats that are inside it. Confirm the server rule with T062.                               | T062, T064       |
| OQ-T61-4 | Does saving a layout with no elements turn `hasLayout` on? An empty plan would make renters see an empty canvas.                                                                                                                                            | The editor refuses to save with zero items ("Nothing to save yet", 6.2). The renter plan also treats `elements: []` as no layout (8). A way to **remove** a layout is out of scope.                                                 | T062, T065, T066 |
| OQ-T61-5 | Is a leave-page guard needed for a dirty draft?                                                                                                                                                                                                             | `beforeunload` plus an in-app `AlertDialog` (2.1). Drop the in-app guard if the router makes it fragile.                                                                                                                            | T065             |
| OQ-T61-6 | Overlap rules are client-side only (the server checks bounds and containment, not overlaps).                                                                                                                                                                | Same-kind overlaps are refused in the editor (seat/seat, cubicle/cubicle, area/area); seats may sit over cubicles and areas (1.2). A direct API call can still overlap; the renter plan draws in DOM order and is not broken by it. | T064             |
| OQ-T61-7 | The renter plan default view: the task leaves "list on narrow screens" as a designer call.                                                                                                                                                                  | List below `md`, Plan from `md`, switch always present (8.1).                                                                                                                                                                       | T066             |
| OQ-T61-8 | Deleting a seat from the plan screen duplicates the seats page. Should the editor offer it at all?                                                                                                                                                          | Yes, behind "Delete seat…" with the same dialog (4), because AC 8.1 lists delete among the plan's actions. "Remove from plan" is the safe default and the Delete key.                                                               | T065             |

## Handoff note for frontend-dev

T064 builds the pure reducer of section 1.2 first (red tests for every row, including `cancel` and the carried seats). T065 then builds the editor of sections 2 to 7 on that reducer; T066 builds the renter plan of section 8 on top of the listing page from ui/03 and reuses its seat tile, selection and review pieces. The announcement strings (3.5) and the problem rows (6.4) belong in `lib/layout-messages.ts` and `lib/marketplace-problems.ts` with tests.
