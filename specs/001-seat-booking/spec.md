# Feature Specification: Seat booking

**Feature Branch**: `feat/001-seat-booking`

**Created**: 2026-10-22

**Status**: Approved (reference slice; approved by the project lead's delegate)

**Input**: User description: "Seat booking: signed-in users browse office spaces and their seats, see which seats are free for a chosen date and time window, book a seat, see their upcoming bookings, and cancel a booking. A seat can never be double-booked for overlapping times (enforced even under concurrent requests). Bookings must be in the future, within working hours 07:00-20:00 local time of the space, at most 10 hours long, and at most 30 days ahead; a user may hold at most one booking at a time (no overlapping bookings for the same user). On successful booking the user receives a confirmation email. Users can only see and cancel their own bookings. Spaces and seats are seeded (admin management is out of scope). Target users: hybrid office employees."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Find a free seat (Priority: P1)

As a hybrid employee planning an office day, I pick an office space, a date and a time window,
and see every seat in that space marked as free or taken for that window.

**Why this priority**: Without seeing availability nobody can book; this is the entry point of the feature.

**Independent Test**: Seed a space with seats and one existing booking; open availability for a
window that overlaps the booking and confirm exactly that seat shows as taken and the rest as free.

**Acceptance Scenarios**:

1. **Given** I am signed in, **When** I open the booking page, **Then** I see the list of office spaces with their name and location.
2. **Given** a space with 6 seats and one seat booked 09:00–12:00 tomorrow, **When** I view availability for tomorrow 10:00–11:00, **Then** 5 seats show as free and the booked seat shows as taken.
3. **Given** the same booking, **When** I view tomorrow 12:00–13:00, **Then** all 6 seats show as free (a booking ending at 12:00 does not block a slot starting at 12:00).
4. **Given** I am not signed in, **When** I try to view availability, **Then** I am asked to sign in.

---

### User Story 2 - Book a seat (Priority: P1)

As an employee, I book a free seat for my chosen window and get confirmation on screen and by email.

**Why this priority**: Booking is the core value of the product.

**Independent Test**: Book a free seat for a valid window; confirm it appears as mine, the seat now
shows as taken for that window, and a confirmation email is delivered.

**Acceptance Scenarios**:

1. **Given** a free seat and a valid window, **When** I book it, **Then** the booking is created, I see a success message, and the seat shows as taken for that window.
2. **Given** I booked a seat, **When** the booking succeeds, **Then** I receive an email naming the space, seat and local date/time of the booking.
3. **Given** another person already holds the seat for an overlapping window, **When** I try to book it, **Then** the booking is refused with a message that the seat is no longer available, and nothing is created.
4. **Given** two people submit bookings for the same seat and overlapping windows at the same moment, **When** both requests are processed, **Then** exactly one succeeds and the other is refused.
5. **Given** I already hold a booking from 09:00 to 12:00, **When** I try to book any seat for 11:00–13:00 the same day, **Then** the booking is refused because I already have a booking at that time.
6. **Given** a window that breaks a booking rule (in the past, outside 07:00–20:00 local time, longer than 10 hours, more than 30 days ahead, end before start, or not on a 15-minute boundary), **When** I try to book, **Then** the booking is refused with a message explaining which rule was broken.

---

### User Story 3 - See and cancel my bookings (Priority: P2)

As an employee, I see my upcoming bookings and cancel one I no longer need, which frees the seat.

**Why this priority**: Cancelling keeps availability accurate, but booking delivers value without it.

**Independent Test**: Create two bookings for a user and one for another user; confirm the list
shows only the user's two (soonest first), cancel one, and confirm the seat is free again.

**Acceptance Scenarios**:

1. **Given** I hold upcoming bookings, **When** I open "My bookings", **Then** I see only my bookings that have not ended, soonest first, each with space, seat and local date/time.
2. **Given** I hold no upcoming bookings, **When** I open "My bookings", **Then** I see an empty state that points me to book a seat.
3. **Given** I hold a booking that has not started, **When** I cancel it, **Then** it disappears from my list and the seat shows as free for that window.
4. **Given** a booking belongs to someone else, **When** I try to cancel it (e.g., by guessing its identifier), **Then** the request is refused exactly as if the booking did not exist.
5. **Given** a booking has already started, **When** I try to cancel it, **Then** the cancellation is refused with an explanation.

### Edge Cases

- Windows that touch but do not overlap (end 12:00, start 12:00) are allowed back to back for the same seat and the same user.
- A cancelled booking no longer blocks the seat or the user's time.
- A request for a seat or space that does not exist is answered with "not found".
- Spaces in different time zones apply working hours in their own local time. Times are displayed in the space's local time and labelled with its time zone.
- Availability for a window that breaks the booking rules (e.g., in the past) is still viewable, but booking it is refused.
- Daylight-saving transitions: rules are evaluated on local wall-clock time of the space.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST require sign-in for every booking feature.
- **FR-002**: The system MUST list office spaces with name, location, time zone and seat count.
- **FR-003**: The system MUST show, for a space and a time window, every seat with a free or taken status for that window.
- **FR-004**: Users MUST be able to book one free seat for a time window.
- **FR-005**: The system MUST never allow two active bookings of the same seat with overlapping windows, including under concurrent requests.
- **FR-006**: The system MUST never allow one user to hold two active bookings with overlapping windows.
- **FR-007**: The system MUST refuse bookings that start in the past, fall outside 07:00–20:00 in the space's local time, last longer than 10 hours or less than 15 minutes, start more than 30 days ahead, or whose start/end are not on 15-minute boundaries. The refusal MUST state which rule failed.
- **FR-008**: The system MUST send the user a booking confirmation email after a successful booking. A delayed or failed email MUST NOT undo the booking.
- **FR-009**: Users MUST be able to list their own bookings that have not yet ended, soonest first.
- **FR-010**: Users MUST be able to cancel their own bookings that have not started. Cancelled bookings MUST stop blocking the seat and the user.
- **FR-011**: Users MUST NOT be able to see or cancel other users' bookings; such attempts MUST behave as if the booking does not exist.
- **FR-012**: The system MUST provide seeded demo spaces and seats in local development (at least two spaces in different time zones).
- **FR-013**: Every booking screen MUST meet WCAG 2.1 AA and show loading, empty, error and success states.

### Key Entities

- **Space**: an office location people can book in. Has a name, a location description, an IANA time zone, and many seats.
- **Seat**: a bookable place within one space. Has a short label unique within its space (e.g., "A-12") and optional features (e.g., "standing desk", "dual monitor").
- **Booking**: one user's reservation of one seat for a time window. Has a start and end instant, a status (active or cancelled), creation and cancellation times. Belongs to one user and one seat.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A signed-in user can go from the booking page to a confirmed booking in under 30 seconds and at most 4 interactions after choosing a window.
- **SC-002**: In a test that fires 20 simultaneous booking requests for the same seat and window, exactly 1 succeeds, every time.
- **SC-003**: Availability for a space with up to 200 seats appears in under 1 second for 95% of requests.
- **SC-004**: 100% of successful bookings produce a confirmation email within 1 minute under normal operation.
- **SC-005**: Automated accessibility checks report zero WCAG 2.1 AA violations on all booking screens.

## Assumptions

- Booking granularity is 15 minutes; this keeps windows predictable for users and availability views simple.
- "At most 30 days ahead" applies to the booking's start time, measured from now.
- Cancelled bookings are kept for history (soft cancel); there is no "past bookings" view in this feature.
- Users book only for themselves; booking on behalf of others, recurring bookings, waitlists, check-in and admin management of spaces and seats are out of scope.
- No cancellation email in this feature (only the booking confirmation email).
- Seed data: two spaces ("London HQ" in Europe/London with 12 seats, "Pune Hub" in Asia/Kolkata with 8 seats).
- Existing email/password sign-in (feature 000) is reused.
