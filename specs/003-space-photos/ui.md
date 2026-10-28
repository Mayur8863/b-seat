# UI spec: Space photos (003), index

**Owner**: ui-ux-designer · **Tokens**: [docs/design/tokens.md](../../docs/design/tokens.md) · **House style**: [002 ui.md](../002-space-marketplace/ui.md)

Semantic tokens only (`bg-primary`, `text-muted-foreground`, ...), WCAG 2.1 AA, mobile first (Tailwind `sm` 640, `md` 768,
`lg` 1024, `xl` 1280). No new token. Every screen specifies default, hover, focus, disabled, loading, empty, error and success
states (FR-026). Each area spec is read by its frontend tasks and by qa-engineer.

| #   | Area spec                                        | Covers                                                                                                      | Spec task | Build tasks              | Status  |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------- | ------------------------ | ------- |
| 01  | [ui/01-owner-photos.md](ui/01-owner-photos.md)   | Owner Photos section: nav, counter, upload queue, description, reorder, delete, leave warning, problem copy | T011      | T013 to T015, T025, T029 | written |
| 02  | [ui/02-renter-photos.md](ui/02-renter-photos.md) | Cover on result cards, placeholder, listing gallery, large view, expiry refresh                             | T012      | T019, T020               | written |

**New `@bseat/ui` components needed (frontend-dev adds them with `shadcn add`, then applies the token notes in each spec):**

- `progress` (Radix; upload percentage, T014). Spec 01 section 1.
- `dialog` (Radix; the large photo view, T020). Spec 02 section 5. Its overlay must use a semantic token, not the shadcn
  default `bg-black/...`.

Reused unchanged: Alert, AlertDialog, Badge, Button, Card, Input, Label, Skeleton, Sonner, Textarea.
