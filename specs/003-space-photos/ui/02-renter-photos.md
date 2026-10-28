# UI 02: Renter photos: cover, placeholder, gallery and large view

**Task**: T012 · **Used by**: T019 (`SpacePhoto`, placeholder, cover on `/find` cards), T020 (gallery and large view), T021 (qa)
**Spec**: US2, AC 2.1 to 2.7, FR-016 to FR-019, FR-021, FR-022, FR-026, SC-003, SC-004, SC-008
**Contracts**: [photos.md](../contracts/photos.md) (renter additions: `ListingCover`, `ListingPhoto`, `photoUrlsExpireAt`)
**Inherits** [002 ui/03](../../002-space-marketplace/ui/03-renter-booking.md) (result card 3.4, listing page 4.1 and 4.6) and [002 ui/01](../../002-space-marketplace/ui/01-shell-accounts.md) (touch targets, link states, contrast). Only differences are written here.

## 1. Components and build map

Reuse from `@bseat/ui`: Button, Card, Skeleton.
Icons (lucide, `aria-hidden` beside text): `ImageIcon`, `ImageOffIcon`, `ChevronLeftIcon`, `ChevronRightIcon`, `XIcon`, `Loader2Icon`.

**One shadcn component to add (frontend-dev, T020):** `dialog` (Radix Dialog: focus trap, Escape, scroll lock, focus return). The
shadcn default overlay is `bg-black/…`, a raw colour. Change it to a semantic token: overlay `bg-background/80
supports-backdrop-filter:backdrop-blur-xs`; content `bg-background text-foreground`. Keep the built-in close button out of the lightbox
(it has its own, 6.2) by not rendering the default one, or restyle it as 6.2 says. **No token change.**

One app component, `SpacePhoto` (T019), renders every photo place: props `photo: { url, width, height, alt } | null`, `variant: 'card' |
'gallery'`, `eager?: boolean`. `null` renders the placeholder (2.2).

| Screen                          | Route / place                                | Task |
| ------------------------------- | -------------------------------------------- | ---- |
| 2. Cover and placeholder, cards | `/find`, inside each result card             | T019 |
| 3. Gallery                      | `/spaces/[spaceId]`, after the location line | T020 |
| 4. Large view                   | dialog opened from the gallery               | T020 |

## 2. Cover and placeholder

### 2.1 Photo frame (every place)

A frame `<div class="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">`. The photo is `object-cover` inside it, with
`width` and `height` from the API on the `<img>` so nothing shifts. The frame has the same size **with and without** a photo (AC 2.2).
`next/image` with `unoptimized` (ADR-0011 section 6); `alt` is the API `altText` (never built on the web).

### 2.2 Placeholder ("No photos yet")

Shown when `cover` is `null` (cards) or `photos` is `[]` (listing). Same frame (2.1), no `<img>`:

- centred column: `ImageIcon` (`size-8`, `aria-hidden`), then the visible text "No photos yet" (`text-sm`, `text-muted-foreground`).
  Muted-foreground on `muted` is 5.50 / 6.09.
- It is plain text in the reading order, which is how it is announced ("No photos yet"). No `role="img"`, no `alt`, no image file.
- Never a stock picture: the icon-and-text box cannot be mistaken for a real space.

### 2.3 Cover on a result card (T019, extends 002 ui/03 3.4)

The result card keeps its structure; the frame is added as the **first child** of the card, inside the card padding (`p-4`), above the
heading. Everything else in 3.4 (h3 link, location, utilities, prices, "Floor plan") is unchanged and stays below it.

- DOM order: frame, then h3 link, as before. The photo is not a separate tab stop and not a second link. The h3 link gets a stretched
  hit area (`after:absolute after:inset-0` on the link, `relative` on the Card) so a click or tap on the photo opens the listing.
  There is **one tab stop per card**, focus ring on the link text as 002 ui/01 2.4.
- Image: the `card` variant only (640 × 480), never `display` (FR-018). `loading="lazy"` except the first 3 cards, which are eager
  (the first row at `lg`). `fetchPriority` is left alone.
- Hover (card): `bg-muted/50` as 3.4; the photo does not change. Focus: link outline. Disabled: n/a.

| State   | Behaviour                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | The frame `bg-muted` with `motion-safe:animate-pulse` until the `load` event. Search loading skeleton changes from `h-40` to `Skeleton h-72 rounded-xl` x 3, so the card height does not jump when results arrive.                           |
| Empty   | Placeholder (2.2). The card is otherwise identical.                                                                                                                                                                                          |
| Error   | `error` event: refetch the search once (the URL may have expired, 7). If it fails again, the frame shows `ImageOffIcon` and "Photo unavailable" (muted-foreground on muted). The card still works. Not "No photos yet": it does have photos. |
| Success | The photo with its `alt`.                                                                                                                                                                                                                    |

Grid unchanged from 3.4: 1 column below `md`, `md:grid-cols-2`, `lg:grid-cols-3`. At 375 px a card photo is about 311 × 233 px; at
1280 px about 340 × 255 px.

## 3. Listing gallery (T020)

`<section aria-labelledby="gallery-heading">` placed **after the location line and before "About this space"** (002 ui/03 4.1 order:
back link, h1, location, gallery, details, ...). Inside the left column from `lg`, so the sticky "Your selection" card is
unaffected. h2 "Photos" (`id="gallery-heading"`, `text-lg font-medium`) and muted beside it "{n} photos" ("1 photo"). With no photos
the heading stays and the placeholder follows (2.2), in the **cover tile's size** so the page layout does not change.

### 3.1 Layout

`<ul class="grid grid-cols-2 gap-3 md:grid-cols-4 items-start">`; each `<li>` holds a `<figure>`.

- **Cover tile** (position 1): `col-span-2` (full width on mobile); from `md` `col-span-2 row-span-2`. It uses the `display` variant.
  It keeps 4:3 so it is the same shape as the placeholder.
- **Other tiles** (positions 2 to 10): one cell each, the `card` variant, 4:3.
- **Captions**: when `description` is not null, a `<figcaption>` under its tile, `text-sm text-foreground`, `line-clamp-2`. No caption
  when there is none (the `alt` default is not shown as text). The full caption is always in the large view (4).
- One photo: just the cover tile, full width, `lg:max-w-xl` so it is not huge.
- Alignment below tiles with and without captions is not pixel-specified (`items-start`).

### 3.2 Tile (button)

Each tile is `<button type="button" aria-haspopup="dialog" class="block w-full cursor-zoom-in">` wrapping the frame (2.1) with
`<img alt="{altText}">` and an sr-only suffix `<span>, photo {n} of {total}, open large view</span>`. Accessible name: "{alt}, photo 3
of 7, open large view". One tab stop per tile, in position order.

| State    | Behaviour                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | The photo, caption below.                                                                                                                                   |
| Hover    | `ring-2 ring-primary` around the frame (7.69 / 7.88 against the page) and `cursor-zoom-in`. The photo itself is not dimmed.                                 |
| Focus    | Solid `outline-2 outline-offset-2 outline-ring` around the frame (7.69 / 7.13). Never removed.                                                              |
| Disabled | n/a.                                                                                                                                                        |
| Loading  | Frame `bg-muted`, `motion-safe:animate-pulse` until `load`. The `<button>` is focusable already.                                                            |
| Empty    | Placeholder (2.2), not a button.                                                                                                                            |
| Error    | A tile whose image fails: one refetch (7); then `ImageOffIcon` and "Photo unavailable" in the frame, the button still opens the large view (which retries). |
| Success  | As Default.                                                                                                                                                 |

### 3.3 Breakpoints

| Width             | Gallery                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 375 px (mobile)   | 2 columns, cover spans both (about 343 × 257 px), other tiles about 166 × 125 px, captions below. Targets are the whole tile (over 44 px). |
| 768 px (tablet)   | 4 columns, the cover is 2 × 2, the rest 1 each.                                                                                            |
| 1280 px (desktop) | Same 4 columns inside the left column (`lg:grid-cols-[1fr_20rem]`, about 700 px wide), cover about 345 × 259 px.                           |

## 4. Large view (T020, FR-017)

A `Dialog` (controlled; `open` state holds the current index). Opened by a tile.

### 4.1 Structure and DOM order (this is the tab order)

`DialogContent` (`bg-background`), a flex column:

1. **Top bar**: `DialogTitle` "{space name} photos" (`text-sm font-medium`, left), position text "{i} of {n}" (`text-sm
text-muted-foreground`, `aria-hidden` because the live region carries it) and `Button variant="ghost" size="icon"`
   **Close** (`XIcon`, `aria-label="Close"`, `size-11`).
2. **Stage**: `flex` row. `Button variant="secondary" size="icon"` **Previous photo** (`ChevronLeftIcon`, `aria-label="Previous photo"`,
   `size-11`) at the left, the image in the middle, **Next photo** (`ChevronRightIcon`) at the right, from `sm`. Below `sm` these two
   sit in a bottom bar under the caption, as text buttons "Previous" and "Next" (`min-h-11`, `flex-1`).
3. **Caption**: `<p>` with the description (`text-sm`, `text-foreground`, centred, `break-words`) only when it is not null.
4. `DialogDescription` (sr-only): "Use the left and right arrow keys to change photo. Press Escape to close."
5. One sr-only live region (`role="status" aria-live="polite" aria-atomic="true"`): "Photo {i} of {n}: {alt}".

Tab order: Close, Previous, Next, back to Close (Radix focus trap). **Initial focus** is Close. Controls never overlap the photo, so
their contrast does not depend on the picture: they sit on `background` or are opaque `secondary`.

With **one photo** there is no Previous or Next and no arrow handling; the position text reads "1 of 1".

### 4.2 Image

`<img alt="{altText}">` the `display` variant, `object-contain`, `max-h-full max-w-full`, whole and uncropped (AC 2.4). The stage
reserves the photo's aspect ratio from `width` and `height` (no shift between photos), on `bg-muted` letterbox (the letterbox is not
text, no contrast need).

### 4.3 Controls and behaviour

| Input                       | Result                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right Arrow, Next button    | Next photo. At the last photo it goes to the first (wraps), so the buttons are never disabled and focus is never lost.                                                                                                                                                                          |
| Left Arrow, Previous button | Previous photo. At the first photo it goes to the last.                                                                                                                                                                                                                                         |
| Home, End                   | First, last photo.                                                                                                                                                                                                                                                                              |
| Escape, Close button        | Close.                                                                                                                                                                                                                                                                                          |
| Click outside (overlay)     | Close, from `sm` where the overlay is visible. Below `sm` the dialog fills the screen.                                                                                                                                                                                                          |
| Touch swipe on the stage    | Swipe left: next; swipe right: previous. A swipe is a pointer move of at least 50 px horizontally that is at least 1.5 times the vertical move. `touch-action: pan-y` on the stage, so vertical scrolling still works. No drag animation; a 150 ms fade of the image (`motion-safe`) on change. |
| Tap on the image            | Nothing (no zoom: non-goal).                                                                                                                                                                                                                                                                    |

Arrow keys work with focus on any control in the dialog. Swipe is an extra: the buttons carry every action (WCAG 2.5.1). Neighbouring
`display` images may be preloaded after the current one has loaded.

### 4.4 Focus return

Closing returns focus to the **tile of the photo that was showing when the dialog closed** (the "opened photo", FR-017). If the
viewer never changed photo this is the tile that opened it. Use `onCloseAutoFocus` to focus that tile, with `scrollIntoView({ block:
'nearest' })`. See OQ-T12-1.

### 4.5 States

| State    | Behaviour                                                                                                                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | Top bar, photo, caption (if any), Previous and Next.                                                                                                                                                                                                                                                                    |
| Hover    | Buttons `bg-secondary/80` (secondary-foreground stays 16.42 / 14.48 on the base; hover is a small step), `ghost` Close `bg-muted`. The image does not change.                                                                                                                                                           |
| Focus    | Solid `outline-2 outline-offset-2 outline-ring` on Close, Previous, Next (7.69 / 7.88 on `background`).                                                                                                                                                                                                                 |
| Disabled | n/a (nothing is disabled).                                                                                                                                                                                                                                                                                              |
| Loading  | Stage: `Skeleton` of the photo's aspect ratio with a centred `Loader2Icon` (`motion-safe:animate-spin`) and sr-only "Loading photo". Position, caption and controls are already live, so keyboard use is never blocked by a slow image.                                                                                 |
| Empty    | n/a (a space with no photos has no tiles to open).                                                                                                                                                                                                                                                                      |
| Error    | `error` event on the image: refetch the listing once (7) and show Loading again. If it fails again: stage `bg-muted` with `ImageOffIcon`, text "We couldn't load this photo." (`text-foreground`) and `Button variant="outline" size="sm"` "Try again" (refetch, then retry). The other photos and controls still work. |
| Success  | The photo, its caption and the live line.                                                                                                                                                                                                                                                                               |

If the refetch shows the space is no longer listed (404, unpublished meanwhile, AC 2.5), the dialog closes and the listing page shows
its existing "We couldn't find that space" state (002 ui/03 4.6).

### 4.6 Breakpoints

| Width             | Large view                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 375 px (mobile)   | Full screen (`fixed inset-0`, no radius, `h-dvh`): top bar, image filling the width, caption, bottom bar with "Previous" and "Next" (`min-h-11`). Body scroll is locked by Radix. |
| 768 px and up     | Centred dialog `w-[min(95vw,64rem)] h-[90dvh]`, `rounded-xl border`, on the `bg-background/80` overlay, icon buttons flanking the photo.                                          |
| 1280 px (desktop) | Same, up to `max-w-5xl`; the photo fits its stage with `object-contain` (never upscaled beyond its natural size).                                                                 |

## 5. Listing page states with photos

Extends 002 ui/03 4.6.

| State     | Behaviour                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading   | The page skeleton gains `Skeleton aspect-[4/3] w-full rounded-xl lg:max-w-xl` between the location line and the details skeleton, under the same `aria-busy` wrapper. |
| 404       | Unchanged. No photos, no hint a space existed (AC 2.5).                                                                                                               |
| Error     | Unchanged (page Alert). Photo failures never replace the page; they use the tile and large view error states.                                                         |
| Own space | Photos show as for any renter (the owner may look at their own listing).                                                                                              |
| Success   | Gallery or placeholder, then the rest as 4.1.                                                                                                                         |

## 6. Freshness (FR-021)

A change by the owner must show to a renter within 1 minute: the find and listing queries must have `staleTime` under 60 s (use 30 s)
and refetch on mount and on window focus. Nothing in the UI announces it.

## 7. Expired photo addresses

Every response carries `photoUrlsExpireAt` (`null` with no photos). Photo addresses live at most 1 hour (FR-019).

- **Before expiry**: while a page that shows photos stays open, refetch its query silently at `photoUrlsExpireAt − 2 minutes` (never
  sooner than 5 s from now), and also when the tab becomes visible and the time has passed (timers sleep in background tabs). Renters
  see nothing change: an image that has loaded keeps showing (no src swap, no flicker); a fresh URL is used for images not yet loaded,
  for errored ones and when the large view opens.
- **After expiry** (a stale open page, or a back-forward restore): a failing image fires `error`. The component refetches **once** (at
  most one refetch per page at a time, shared by all failing images) and swaps in the new URLs. While waiting, the frame is the Loading
  state (not "No photos yet", not a broken-image glyph). If the refetch still fails, the Error states above apply: "Photo unavailable" on
  tiles and cards, "We couldn't load this photo." with "Try again" in the large view.
- If a refetch finds the space unpublished or removed, the pages show their 404 states (AC 2.5, FR-019), without photos.
- The refresh must never move focus, close the large view or reset the gallery position. The open large view keeps its index by photo
  id; if that id is gone from the refetched list it shows the nearest remaining photo and announces "Photo {i} of {n}: {alt}".

## 8. Contrast and accessibility notes

- Pairs (all from tokens.md, no new pair): caption `foreground` on `background` 19.79 / 18.96; position text and placeholder text
  `muted-foreground` on `background` 6.00 / 7.98 and on `muted` 5.50 / 6.09; `secondary-foreground` on `secondary` for Previous and
  Next 16.42 / 14.48; focus outline `ring` on `background` 7.69 / 7.88. **No text or control sits on top of a photo**: captions,
  position and controls are on `background` or an opaque fill, so FR-026's 4.5:1 does not depend on the image. Overlay is a token
  (`background/80`), not a raw black.
- No colour-only meaning: the placeholder says "No photos yet", the error frames say "Photo unavailable", the position is text
  ("3 of 7"), controls have labels.
- Headings: h1 space name, h2 "Photos", then "About this space" as before. The dialog's title is the dialog name.
- Roles: the gallery is a list of buttons (`aria-haspopup="dialog"`); the large view is a modal `dialog` (`aria-labelledby` the title,
  `aria-describedby` the sr-only help). Focus trapped, Escape closes, focus returns (4.4). Background is inert while open (Radix).
- Live regions: only the large view's polite status (position and alt). Cards and tiles announce nothing on load.
- Reduced motion: no animation besides the spinner, the loading pulse and the 150 ms fade, all `motion-safe`.
- Touch: tiles and controls are at least 44 px (Close and icon buttons `size-11`).
- Dark theme: the same classes; the overlay and dialog follow `background`.
- qa (T021): axe on `/find` results with covers, with a placeholder and with an image error; `/spaces/{id}` with 1 photo, 7 photos and
  none; the large view open (first, middle, last photo, with and without caption); keyboard: Tab order, arrows, Home and End, Escape,
  focus return to the right tile; touch swipe in a mobile project; expiry (set `PHOTO_URL_TTL_SECONDS=2`, wait, confirm the images
  refresh and focus is not lost); 375 and 1280 px, light and dark.

## 9. Decisions and open questions

None blocks the frontend tasks. Each interim below is the designer's choice; a human or architect may override it.

| Id       | Question                                                                                                                              | Interim used here                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-T12-1 | FR-017: after the viewer moves to another photo and closes, does focus return to the tile that opened it, or to the tile now showing? | The tile of the photo showing at close (4.4). The same when the viewer never moved. Switch to the opener by dropping `onCloseAutoFocus`. |
| OQ-T12-2 | 002 ui/03 3.4 says the whole card is not a link. With a photo, should clicking it open the listing?                                   | Yes, through the h3 link's stretched hit area (2.3). Still one tab stop. Drop the `after:` classes to keep the old rule.                 |
| OQ-T12-3 | The large view wraps around at the ends.                                                                                              | Wraps (4.3), so no control is ever disabled. Stop-at-ends would need disabled or hidden buttons and focus handling.                      |
| OQ-T12-4 | Captions on gallery tiles are clamped to 2 lines.                                                                                     | Clamped; the large view always shows the full text.                                                                                      |
| OQ-T12-5 | A tile of a photo that fails to load keeps opening the large view.                                                                    | Yes (3.2), because the large view retries with fresh addresses.                                                                          |

## Handoff note for frontend-dev

T019 builds `SpacePhoto`, the placeholder (2.2) and the card change (2.3), plus the search skeleton height. T020 adds `dialog` to
`@bseat/ui`, the gallery (3) and the large view (4), and the shared expiry refresh (7), which T014 can reuse for the owner page.
`next.config.ts` gets `images: { unoptimized: true }` globally (ADR-0011 section 6).
