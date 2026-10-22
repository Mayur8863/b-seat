# Design tokens

Source of truth: `packages/ui/src/styles/globals.css` (Tailwind v4 + shadcn/ui, style `radix-nova`).
Owner: ui-ux-designer. This file documents what exists; change the CSS and this file in the same PR.

## Rules

- Components and pages use **semantic utilities only** (`bg-primary`, `text-muted-foreground`,
  `border-input`, `ring-ring`). Never raw palette colours (`bg-blue-600`) or hex/oklch literals.
- Every token has a light value (`:root`) and a dark value (`.dark`). Dark mode is the `.dark` class
  on `<html>`, set by `next-themes` (`attribute="class"`, default `system`).
- Pair a surface with its `-foreground` token. Other text-on-surface pairs must be in the contrast
  table below; add a row (light and dark) before using a new pair.
- New token: only when no existing one fits. Define it in `:root`, `.dark` and `@theme inline`
  (`--color-<name>`), and document it here with its contrast pairs.

## Semantic colour tokens

| Token (utility)                          | Light                         | Dark                          | Use                                                     |
| ---------------------------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------------- |
| `background` / `foreground`              | `oklch(1 0 0)` / `0.145 0 0`  | `0.145 0 0` / `0.985 0 0`     | Page surface and body text                              |
| `card` / `card-foreground`               | `1 0 0` / `0.145 0 0`         | `0.205 0 0` / `0.985 0 0`     | Cards, alerts, seat and space tiles                     |
| `popover` / `popover-foreground`         | `1 0 0` / `0.145 0 0`         | `0.205 0 0` / `0.985 0 0`     | Dialogs, toasts (sonner `--normal-bg`)                  |
| `primary` / `primary-foreground`         | `0.45 0.16 264` / `0.985 0 0` | `0.72 0.14 264` / `0.145 0 0` | Main action, links, selected state                      |
| `secondary` / `secondary-foreground`     | `0.97 0 0` / `0.205 0 0`      | `0.269 0 0` / `0.985 0 0`     | Secondary button, neutral badge                         |
| `muted` / `muted-foreground`             | `0.97 0 0` / `0.5 0 0`        | `0.269 0 0` / `0.72 0 0`      | Subdued surfaces (skeleton, taken seat); secondary text |
| `accent` / `accent-foreground`           | `0.97 0 0` / `0.205 0 0`      | `0.269 0 0` / `0.985 0 0`     | Menu/list item highlight (shadcn)                       |
| `destructive` / `destructive-foreground` | `0.55 0.22 27` / `0.985 0 0`  | `0.7 0.19 22` / `0.145 0 0`   | Errors, destructive actions                             |
| `success` / `success-foreground`         | `0.5 0.13 150` / `0.985 0 0`  | `0.72 0.15 150` / `0.145 0 0` | Positive status text/icons ("Free")                     |
| `border`                                 | `0.922 0 0`                   | `1 0 0 / 12%`                 | Dividers, card and tile borders                         |
| `input`                                  | `0.922 0 0`                   | `1 0 0 / 18%`                 | Input/select borders; dark input fill (`bg-input/30`)   |
| `ring`                                   | `0.45 0.16 264`               | `0.72 0.14 264`               | Focus indicator (equals `primary`)                      |

All values are `oklch(L C H)`; the `oklch()` wrapper is omitted after the first cell.
`destructive-foreground` and `success-foreground` are BSeat additions to the shadcn set.

## Contrast pairs (WCAG 2.1)

Computed from the OKLCH values (converted to sRGB, WCAG relative luminance; alpha blended over
the named surface). Text needs 4.5:1; UI parts and focus indicators need 3:1.

| Pair (foreground on surface)                                                                    | Light |        Dark | Result                          |
| ----------------------------------------------------------------------------------------------- | ----: | ----------: | ------------------------------- |
| `foreground` on `background`                                                                    | 19.79 |       18.96 | AA text                         |
| `foreground` on `card`                                                                          | 19.79 |       17.16 | AA text                         |
| `primary-foreground` on `primary` (default button)                                              |  7.37 |        7.88 | AA text                         |
| `primary-foreground` on `primary/80` (button hover)                                             |  4.56 |        5.33 | AA text                         |
| `primary` on `background` (links)                                                               |  7.69 |        7.88 | AA text                         |
| `primary` on `card`                                                                             |  7.69 |        7.13 | AA text                         |
| `secondary-foreground` on `secondary`                                                           | 16.42 |       14.48 | AA text                         |
| `muted-foreground` on `background`                                                              |  6.00 |        7.98 | AA text                         |
| `muted-foreground` on `card`                                                                    |  6.00 |        7.22 | AA text                         |
| `muted-foreground` on `muted` (taken seat)                                                      |  5.50 |        6.09 | AA text                         |
| `muted-foreground` on `muted/50` over card (hover)                                              |  5.75 |        6.68 | AA text                         |
| `destructive` on `background`                                                                   |  5.43 |        6.79 | AA text                         |
| `destructive` on `card` (destructive alert)                                                     |  5.43 |        6.15 | AA text                         |
| `destructive/90` on `card` (alert description)                                                  |  4.97 |        5.19 | AA text                         |
| `destructive` on `destructive/10` (light) or `/20` (dark) over card (destructive button, badge) |  4.57 |        4.60 | AA text (tight: do not lighten) |
| `destructive-foreground` on `destructive`                                                       |  5.20 |        6.79 | AA text                         |
| `success` on `background`                                                                       |  5.65 |        8.47 | AA text                         |
| `success` on `card`                                                                             |  5.65 |        7.67 | AA text                         |
| `success` on `primary/5` (light) or `/10` (dark) over card (selected tile)                      |  5.23 |        6.57 | AA text                         |
| `success-foreground` on `success`                                                               |  5.41 |        8.47 | AA text                         |
| `ring` / `primary` solid on `background` or `card` (focus outline, selected border)             |  7.69 |        7.13 | AA non-text                     |
| `ring/50` 3 px halo on `background` (shadcn focus halo)                                         |  2.43 |        2.72 | Below 3:1, see finding F1       |
| `input` / `border` on `background` (field boundary)                                             |  1.26 | 1.64 / 1.33 | Below 3:1, see finding F2       |

### Findings (no token changed in T006)

No text pair fails AA, so `globals.css` is unchanged.

- **F1 (minor) Focus halo.** The shadcn `focus-visible:ring-3 ring-ring/50` halo alone is
  2.43:1 (light) and 2.72:1 (dark). Input, outline, ghost, secondary and destructive buttons and the
  badge also switch to a solid `border-ring` on focus (7.7:1), which meets 3:1. The filled default
  `Button` does not: its border already equals its fill, so the halo (3.16:1 against the fill,
  2.43:1 against the page) is the only change. No `--ring` value fixes this in light mode short of
  near-black (L ≤ 0.30). Suggested fix (a `packages/ui` styling change, not a token): add
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` to the default
  button variant. New booking tiles already use a solid outline (see `specs/001-seat-booking/ui.md`).
- **F2 (minor) Field boundaries.** `border-input` is 1.26:1 (light) and 1.64:1 (dark). Every field
  has a visible label above it, and focus switches to a solid ring border, so fields stay
  identifiable. This is the shadcn default. Darkening `--input` would also darken disabled fills
  (`bg-input/50`), so decide it as a separate change.
- **F3 (minor) Toast colours.** `apps/web` mounts `<Toaster richColors />`. Rich colours come from
  sonner's built-in palette, not from these tokens. Either verify them in the visual review, or drop
  `richColors` so toasts use `popover` / `popover-foreground` (19.8:1); the icons still show the type.

## Radius

`--radius: 0.625rem` (10 px). Derived in `@theme inline`:

| Utility       | Value                               | Used by                                |
| ------------- | ----------------------------------- | -------------------------------------- |
| `rounded-sm`  | `calc(var(--radius) - 4px)` = 6 px  | small inner elements                   |
| `rounded-md`  | `calc(var(--radius) - 2px)` = 8 px  | skeleton, xs/sm buttons                |
| `rounded-lg`  | `var(--radius)` = 10 px             | button, input, alert, seat/space tiles |
| `rounded-xl`  | `calc(var(--radius) + 4px)` = 14 px | card, booking card                     |
| `rounded-4xl` | Tailwind default, 2 rem             | badge (pill)                           |

Sonner toasts use `--border-radius: var(--radius)`.

## Motion

- `tw-animate-css` provides enter/exit animations (`animate-in`, `fade-in`, `zoom-in-95`) used by
  shadcn overlays such as `alert-dialog`.
- Interactive components use Tailwind's default transition (150 ms, ease) via `transition-all` or
  `transition-colors`. Buttons nudge 1 px on press (`active:translate-y-px`).
- Loading: `Skeleton` uses `animate-pulse`; spinners use lucide `Loader2Icon` with `animate-spin`,
  always next to a text label so the label carries the meaning when motion is off.
- **Reduced motion** (WCAG 2.3.3): `@media (prefers-reduced-motion: reduce)` in the base layer sets
  every animation and transition to 0.01 ms. Do not add JavaScript smooth scrolling
  (`behavior: 'smooth'`); the CSS rule cannot stop it.
- `next-themes` runs with `disableTransitionOnChange`, so a theme switch never animates.

## Focus

- Base layer: `outline-ring/50` on every element (applies only where an outline is drawn).
- shadcn components: `focus-visible:border-ring` plus `ring-3 ring-ring/50` (see F1).
- Custom interactive surfaces (choice tiles, cards that act as controls): solid
  `outline-2 outline-offset-2 outline-ring` on `:focus-visible` (7.7:1 light, 7.9:1 dark).
