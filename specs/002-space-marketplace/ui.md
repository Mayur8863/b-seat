# UI spec: Space marketplace (002), index

**Owner**: ui-ux-designer · **Tokens**: [docs/design/tokens.md](../../docs/design/tokens.md) · **House style**: [001 ui.md](../001-seat-booking/ui.md)

Semantic tokens only (`bg-primary`, `text-muted-foreground`, ...), WCAG 2.1 AA, mobile first
(Tailwind `sm` 640, `md` 768, `lg` 1024). Every screen specifies default, hover, focus, disabled, loading, empty,
error and success states (FR-032). Each area spec is read by its frontend task and by qa-engineer.

| #   | Area spec                                          | Covers                                                                               | Spec task | Build tasks              | Status  |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- | ------------------------ | ------- |
| 01  | [ui/01-shell-accounts.md](ui/01-shell-accounts.md) | Shell, nav, sub-nav pattern, sign-up, preferences, dashboards, shared copy           | T010      | T014, T015               | written |
| 02  | `ui/02-owner-listing.md`                           | Space form, seats and cubicles, slots and prices, publish, `[spaceId]` layout states | T018      | T022 to T024, T030       | planned |
| 03  | `ui/03-renter-booking.md`                          | Find a space, listing page, pass booking, my bookings                                | T029      | T031, T039 to T041, T057 | planned |
| 04  | `ui/04-owner-operations.md`                        | Occupancy, calendars, owner bookings                                                 | T046      | T048, T052, T058         | planned |
| 05  | `ui/05-layout.md`                                  | Layout editor and renter plan view                                                   | T061      | T064 to T066             | planned |

Later specs reuse the conventions in 01 section 7 (copy, time, money) and the sub-nav in section 3.2, and add their
own routes to `lib/nav.ts` (each page task adds its own link; `typedRoutes` rejects routes that do not exist yet).
