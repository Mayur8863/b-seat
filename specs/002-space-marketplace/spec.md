# Feature Specification: Space marketplace (owners list, renters book passes)

**Feature Branch**: `feat/002-space-marketplace`

**Created**: 2026-10-27

**Status**: Approved (spec gate passed by the requester, 2026-10-27)

**Input**: User description: "I see only a simple dashboard, and for the seat layout I have to type the URL; there is no way to get there from the dashboard. Create a screen where a user can sign up either as a space owner or as a person who needs a space on a rental basis. Owners can list a day pass, weekly pass and monthly pass, and a person picks which one they want while booking a seat. Owners can mark a seat vacant or occupied if it is occupied internally or through other sources. Owners can set a range for when seats are available, or the specific days they are available, using a single calendar for all seats (the default) or a different calendar per seat. A canvas lets owners lay out their seats and cubicles. Owners give the country, city and area of the space, and renters say where they want a space, so they can search by location. Owners give the name and description of their space and the utilities they provide."

**Clarifications given with the request (2026-10-27)**:

- Prices are shown in the app and paid **offline**, directly to the owner. No online payment.
- A pass is booked for a **time slot**. A space open around the clock offers a 12-hour day slot (e.g., 07:00–19:00), a 12-hour night slot (e.g., 19:00–07:00) and a 24-hour slot, which the owner can price at a discount. A space that closes at night offers one "working hours" slot, so there is only one pass per seat per day.
- Passes **replace** the hourly booking from feature 001.
- A person picks **one role at sign-up**: "I own a space" or "I need a space".
- A weekly or monthly pass keeps the **same seat** for the whole period (confirmed at the spec gate).
- Days the seat is unavailable inside a pass period are **skipped at the same price**; the end date does not move (confirmed at the spec gate).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign up with a role and find my way from the dashboard (Priority: P1)

As a new user, I say at sign-up whether I own a space or need one, and I land on a dashboard
that links to everything I can do, so I never have to type a URL.

**Why this priority**: Every other story depends on knowing who is an owner and who is a
renter. Today the dashboard is a dead end, which blocks people from reaching booking at all.

**Independent Test**: Sign up once as an owner and once as a renter. Confirm each lands on a
dashboard for their role, and that every feature page they can use is reachable by clicking
from it.

**Acceptance Scenarios**:

1. **Given** I am on the sign-up page, **When** I fill in my details, **Then** I must choose between "I own a space" and "I need a space" before I can create the account.
2. **Given** I choose "I need a space", **When** sign-up succeeds, **Then** I may also give my preferred country, city and area (optional), and I land on the renter dashboard.
3. **Given** I am a renter, **When** I open my dashboard, **Then** I see links to "Find a space" and "My bookings", plus a summary of my next booking or an empty state that points me to search.
4. **Given** I am an owner, **When** I open my dashboard, **Then** I see my spaces (or an empty state that invites me to list my first space), each with links to edit details, seats and layout, passes, availability and bookings.
5. **Given** I am on any signed-in page, **When** I use the main navigation, **Then** I can reach my dashboard and every page for my role by keyboard or pointer.
6. **Given** an account created before this feature, **When** its owner signs in, **Then** the account is treated as a renter.

---

### User Story 2 - List my space (Priority: P1)

As a space owner, I create a listing with the space's name, description, location and
utilities, and add its seats, so renters can find it.

**Why this priority**: Without listings there is nothing to search or book.

**Independent Test**: As an owner, create a space with all required details and 10 seats,
publish it, and confirm it appears in a renter's search for its city.

**Acceptance Scenarios**:

1. **Given** I am an owner, **When** I create a space, **Then** I must give a name, a description, a country, a city, an area/locality, a street address, a time zone (suggested from the country) and its opening hours: either "Open 24 hours" or "Fixed working hours" with an opening and a closing time.
2. **Given** I am creating a space, **When** I choose utilities, **Then** I can tick any from a standard list (e.g., Wi-Fi, air conditioning, power backup, parking, meeting room, tea/coffee, printer, lockers, 24-hour security, cafeteria, accessible entrance) and add up to 5 utilities of my own.
3. **Given** my space exists, **When** I add seats, **Then** each seat has a label unique within the space (e.g., "A-12"), an optional cubicle or zone name, and optional features (e.g., "standing desk"). I can add many seats at once with a label pattern (e.g., "A-1" to "A-20").
4. **Given** my space is a draft, **When** I publish it without at least one seat and at least one priced pass, **Then** publishing is refused with a message that says what is missing.
5. **Given** my space is published, **When** I unpublish it, **Then** it disappears from search, and existing bookings stay valid and visible to their renters.
6. **Given** a space belongs to another owner, **When** I try to view its management pages or change it (e.g., by guessing its address), **Then** the request is refused exactly as if the space did not exist.

---

### User Story 3 - Set up slots, passes and prices (Priority: P1)

As an owner, I choose which time slots my space offers and the price of a day, weekly and
monthly pass for each slot, so renters know what they can book and what it costs.

**Why this priority**: Passes are the only way to book once hourly booking is retired.

**Independent Test**: For a 24-hour space, enable the day, night and 24-hour slots with day
and monthly prices. Confirm a renter sees exactly those options and prices, including the
24-hour saving.

**Acceptance Scenarios**:

1. **Given** my space is "Open 24 hours", **When** I set up slots, **Then** I set one shift change time (e.g., 07:00). That gives a day slot (07:00–19:00), a night slot (19:00–07:00 the next morning) and a 24-hour slot (07:00–07:00 the next morning), and I can turn each slot on or off.
2. **Given** my space has "Fixed working hours" (e.g., 09:00–18:00), **When** I set up slots, **Then** it has exactly one slot, "Working hours", matching the opening hours.
3. **Given** a slot is on, **When** I set prices, **Then** I can offer a day pass (1 day), a weekly pass (7 consecutive days) and a monthly pass (30 consecutive days) for that slot, each with its own price. Leaving a price empty means that pass is not offered.
4. **Given** I set prices, **When** I save, **Then** all prices are in the one currency I chose for the space, are greater than zero, and have at most two decimal places.
5. **Given** the 24-hour price is lower than the day price plus the night price for the same pass length, **When** a renter views the options, **Then** the 24-hour option shows the saving as an amount and a percentage.
6. **Given** renters hold bookings, **When** I change a price, **Then** existing bookings keep the price they were booked at.

---

### User Story 4 - Search by location and book a seat with a pass (Priority: P1)

As someone who needs a space, I search by country, city and area, open a space, pick a pass,
slot, start date and free seat, and get a confirmed booking with the price I will pay the owner.

**Why this priority**: This is how renters get value. It replaces the hourly booking flow.

**Independent Test**: Seed two published spaces in different cities. Search by one city,
open the result, book a weekly day-slot pass on a free seat, and confirm the booking, the
confirmation email and that the seat now shows as taken for those 7 days.

**Acceptance Scenarios**:

1. **Given** I am signed in, **When** I open "Find a space", **Then** the country, city and area filters are prefilled from my preferences (if I gave any), and I see published spaces that match, each with name, area, city, utilities and the lowest price per pass type.
2. **Given** I type a city or area, **When** suggestions appear, **Then** they come from published listings, and matching ignores letter case and surrounding spaces.
3. **Given** I also filter by date, pass type, slot or utilities, **When** results load, **Then** I see only spaces with at least one seat free for that whole pass, and spaces with all the chosen utilities.
4. **Given** I open a space, **When** I choose a pass type, a slot and a start date, **Then** I see every seat as free or taken for the whole pass period (text and icon, not colour alone), the end date and time, and the price.
5. **Given** a free seat, **When** I book it, **Then** the booking is created for that seat, slot and every day of the pass. I see a confirmation that includes the price and a note that payment is made directly to the owner, and I receive the same details by email.
6. **Given** another person or the owner holds the seat on any day of the pass period for an overlapping slot, **When** I try to book, **Then** the booking is refused with a message that the seat is no longer available, and nothing is created.
7. **Given** two people book the same seat for overlapping periods at the same moment, **When** both requests are processed, **Then** exactly one succeeds.
8. **Given** I already hold a booking whose time overlaps the new one at any space, **When** I try to book, **Then** the booking is refused because I already have a booking at that time.
9. **Given** a start date more than 30 days ahead, or a slot that has already started, **When** I try to book, **Then** the booking is refused with a message naming the rule.
10. **Given** a new booking is made at my space, **When** I am the owner, **Then** I receive an email with the renter's name, seat, pass, period and price.

---

### User Story 5 - Mark a seat occupied or vacant (Priority: P2)

As an owner, I mark seats as occupied when they are used internally or booked through another
channel, and vacant again when they free up, so renters never book a seat that is already taken.

**Why this priority**: Owners rarely sell every seat only through BSeat. Without this, double
bookings happen outside the system.

**Independent Test**: Mark a seat occupied for next week. Confirm renters see it as taken for
those dates, that booking it is refused, and that marking it vacant frees it again.

**Acceptance Scenarios**:

1. **Given** I own a space, **When** I mark one or more seats occupied, **Then** I give a start date, an optional end date (none means "until I mark it vacant") and an optional private note (e.g., "internal team"). Those seats show as taken to renters for those dates.
2. **Given** a seat is marked occupied, **When** I mark it vacant, **Then** the mark ends today and the seat is bookable again from the next slot that has not started.
3. **Given** a renter already holds a booking on a seat for some of those dates, **When** I try to mark it occupied over them, **Then** the change is refused and I see the conflicting dates. Owners cannot cancel renters' bookings in this feature.
4. **Given** I am viewing my seats, **When** I look at any seat, **Then** I see its current state for today (vacant, occupied by me, or booked by a renter) and the private note, which renters never see.

---

### User Story 6 - Availability calendar (Priority: P2)

As an owner, I set when my seats can be booked, with a date range and the days of the week.
One shared calendar applies to all seats by default, and I can give a seat its own calendar.

**Why this priority**: Spaces open on set days or for a season. Without a calendar, owners
would have to mark seats occupied day by day.

**Independent Test**: Set the shared calendar to Monday–Friday from 1 Nov to 31 Dec and give
one seat its own Saturday-only calendar. Confirm renters can book only on those days, seat
by seat.

**Acceptance Scenarios**:

1. **Given** a new space, **When** I open its availability, **Then** it has one shared calendar for all seats: available from today, no end date, every day of the week.
2. **Given** the shared calendar, **When** I set a start date, an optional end date and the days of the week, **Then** every seat that uses the shared calendar is bookable only on those days.
3. **Given** a seat, **When** I switch it to "own calendar", **Then** I set its own start date, end date and days of the week, and the shared calendar no longer applies to it. Switching back restores the shared calendar.
4. **Given** a weekly or monthly pass whose period includes days the seat's calendar marks unavailable, **When** a renter views or books it, **Then** those days are shown as "closed" and not included, the pass may only start on an available day, and the price stays the same.
5. **Given** renters hold bookings, **When** I change a calendar so some booked days become unavailable, **Then** the existing bookings stay valid and I am told how many bookings fall outside the new calendar.

---

### User Story 7 - See and cancel bookings (Priority: P2)

As a renter, I see my upcoming bookings and cancel one before it starts. As an owner, I see
the bookings for my spaces.

**Why this priority**: This carries the "My bookings" story from feature 001 over to passes, and
gives owners the list they need to collect payment offline.

**Independent Test**: Make two bookings as one renter and one as another at the same space.
Confirm each renter sees only their own, the owner sees all three, and cancelling one frees
its seat.

**Acceptance Scenarios**:

1. **Given** I am a renter, **When** I open "My bookings", **Then** I see my bookings that have not ended, soonest first, each with space, area, seat, pass, slot, period (in the space's local time and labelled with its time zone) and price.
2. **Given** my booking has not started, **When** I cancel it, **Then** the whole pass is cancelled and its seat becomes free for the whole period. A booking that has started cannot be cancelled.
3. **Given** I am an owner, **When** I open a space's bookings, **Then** I see upcoming bookings with the renter's name and email, seat, pass, period and price, filterable by date.
4. **Given** a booking belongs to someone else (and, for owners, to someone else's space), **When** I try to see or cancel it, **Then** the request is refused exactly as if it did not exist.

---

### User Story 8 - Lay out seats and cubicles on a canvas (Priority: P3)

As an owner, I draw a simple floor plan, placing seats, cubicles and labelled areas, and
renters pick a seat from that plan.

**Why this priority**: It helps renters choose, but the seat list already lets them book.

**Independent Test**: Place 6 seats in two cubicles and a "Meeting room" area, save, and
confirm a renter sees the same plan with each seat's free or taken state and can book from it.

**Acceptance Scenarios**:

1. **Given** I own a space, **When** I open its layout editor, **Then** I can add, move, resize, rename and delete seats, cubicles (which hold seats) and labelled areas (e.g., "Meeting room", "Kitchen", "Entrance") on a grid.
2. **Given** I add a seat on the canvas, **When** I save, **Then** it is the same seat as in the seat list (and the reverse: seats added in the list appear in an "unplaced" tray I can drag from).
3. **Given** I use only a keyboard, **When** I edit the layout, **Then** I can select every item, move it with the arrow keys, resize it and edit its name, and every change can also be made from a form.
4. **Given** a renter views a space with a layout, **When** they choose a pass, slot and date, **Then** the plan shows each seat's label and free/taken state (with text or icon, not colour alone), and choosing a free seat starts the booking. A list view is always available.
5. **Given** a space has no layout, **When** a renter views it, **Then** they see the seat list only.

### Edge Cases

- A night slot crosses midnight. It belongs to the date it starts on, and in a weekly night pass the last night ends on the morning after the 7th day.
- Day and night slots on the same seat and date can be held by different renters. A 24-hour booking blocks both, and either one blocks the 24-hour slot.
- A slot that touches another (one ends at 19:00, the next starts at 19:00) does not overlap.
- Daylight-saving changes: slot times follow the space's local wall-clock time, so a slot can last 11 or 13 hours on a changeover day.
- An owner switches a space from "Open 24 hours" to "Fixed working hours" while renters hold night or 24-hour bookings. The existing bookings stay valid, and only new bookings use the new slots.
- An owner deletes a seat or a cubicle that has future bookings. This is refused, and the owner must wait until the bookings end or are cancelled.
- A renter searches for a city with no published spaces. They see an empty state that suggests widening the search to the whole country.
- An owner tries to book a seat in their own space. This is refused, because owners use "mark occupied" instead.
- A space has no seat available for a chosen pass, for example a monthly pass when only scattered days are free. Search leaves it out, and the space page says no seat is free for the whole period.

## Requirements _(mandatory)_

### Functional Requirements

**Accounts and navigation**

- **FR-001**: Sign-up MUST require the person to choose one role: owner ("I own a space") or renter ("I need a space"). The role cannot be changed in this feature.
- **FR-002**: Renters MAY give a preferred country, city and area at sign-up or later from their dashboard. These prefill search.
- **FR-003**: Accounts created before this feature MUST be treated as renters.
- **FR-004**: Every signed-in page MUST show navigation for the user's role, linking the dashboard and every feature page for that role. No feature may be reachable only by typing its address.
- **FR-005**: Every feature in this spec MUST require sign-in.

**Listings**

- **FR-006**: Owners MUST be able to create, edit, publish and unpublish spaces. A space has a name (1–100 characters), a description (1–2,000 characters), a country (from a standard country list), a city and an area/locality (1–100 characters each), a street address (1–200 characters), a time zone, a currency, opening hours ("Open 24 hours" or fixed opening and closing times), and utilities (from a standard list plus up to 5 custom ones of up to 40 characters).
- **FR-007**: Owners MUST be able to add, rename and remove seats, singly or in bulk by label pattern. Labels MUST be unique within a space. A space MUST NOT have more than 200 seats. A seat with future bookings MUST NOT be removable.
- **FR-008**: A space MUST NOT be publishable without at least one seat and at least one priced pass. Only published spaces appear in search.
- **FR-009**: Owners MUST only see and change their own spaces, seats, layouts, calendars and occupancy. Any other space MUST behave as if it does not exist.

**Slots, passes and prices**

- **FR-010**: A 24-hour space MUST offer up to three slots from one owner-set shift change time T: day (T to T+12h), night (T+12h to T+24h) and 24-hour (T to T+24h), each on or off. A fixed-hours space MUST offer exactly one "working hours" slot.
- **FR-011**: For each slot that is on, owners MUST be able to price a day pass (1 day), weekly pass (7 consecutive days) and monthly pass (30 consecutive days). An unpriced pass is not offered. Prices are positive, have at most two decimal places, and use the space's single currency.
- **FR-012**: When the 24-hour price is below the sum of the day and night prices for the same pass length, renters MUST see the saving as an amount and a percentage.
- **FR-013**: A booking MUST record the price, currency, pass and slot at the time of booking. Later price changes MUST NOT change it.

**Search and booking**

- **FR-014**: Renters MUST be able to search published spaces by country (required), city and area (optional, ignoring letter case and surrounding spaces). They can also filter by start date, pass type, slot and utilities. City and area suggestions MUST come from published listings.
- **FR-015**: A search result MUST show the space name, area, city, utilities and the lowest price for each pass type offered.
- **FR-016**: For a chosen space, pass, slot and start date, the system MUST show every seat as free or taken for the whole pass period, plus the end date and time and the price.
- **FR-017**: A booking MUST cover one seat, one slot and every available day in the pass period. Days the seat's calendar marks unavailable are skipped, and the pass MUST start on an available day.
- **FR-018**: The system MUST never allow two active bookings, or a booking and an occupied mark, to overlap in time on the same seat, including under concurrent requests.
- **FR-019**: The system MUST never allow one renter to hold two active bookings that overlap in time.
- **FR-020**: The system MUST refuse bookings whose first slot has already started or starts more than 30 days from now, bookings on unpublished spaces, and bookings by the space's own owner, stating which rule failed.
- **FR-021**: After a successful booking, the renter MUST get a confirmation email and the owner a new-booking email, each with space, seat, pass, slot, period (local time with time zone) and price. A delayed or failed email MUST NOT undo the booking. Emails MUST state that payment is made directly to the owner.

**Occupancy and availability**

- **FR-022**: Owners MUST be able to mark one or more seats occupied from a start date to an optional end date, with an optional private note (up to 200 characters), and to mark them vacant. Occupied seats MUST show as taken to renters, and the note MUST never be shown to renters.
- **FR-023**: Marking a seat occupied over existing renter bookings MUST be refused, listing the conflicting dates.
- **FR-024**: Each space MUST have one shared availability calendar (start date, optional end date, days of the week). By default it starts on the space's creation date, has no end date and covers all 7 days. Owners MUST be able to give any seat its own calendar and switch it back to the shared one.
- **FR-025**: Calendar changes MUST NOT cancel existing bookings. The owner MUST be told how many future bookings fall outside the new calendar.

**Bookings lists**

- **FR-026**: Renters MUST be able to list their own bookings that have not ended, soonest first, and cancel a booking before its first slot starts. Cancelling frees the whole period.
- **FR-027**: Owners MUST be able to list upcoming bookings for their own spaces with the renter's name and email, filterable by date.
- **FR-028**: Users MUST NOT be able to see or cancel bookings they do not own (renters) or that are not at their spaces (owners). Such attempts MUST behave as if the booking does not exist.

**Layout**

- **FR-029**: Owners MUST be able to place seats, cubicles and labelled areas on a grid-based floor plan, and move, resize, rename and delete them. Seats on the plan and in the seat list MUST be the same seats.
- **FR-030**: Every layout editing action MUST be possible by keyboard and through a form-based alternative.
- **FR-031**: Renters MUST be able to see the plan with each seat's label and free/taken state (not by colour alone) and start a booking from it. A list view MUST always be available.

**Quality**

- **FR-032**: Every screen in this feature MUST meet WCAG 2.1 AA and show loading, empty, error and success states.
- **FR-033**: All dates and times MUST be shown in the space's local time and labelled with its time zone.

### Key Entities

- **User role**: Each account is an owner or a renter, chosen at sign-up. Renters have an optional preferred country, city and area.
- **Space (listing)**: Belongs to one owner. Has name, description, location (country, city, area, street address), time zone, currency, opening hours, utilities and a status (draft, published or unpublished).
- **Utility**: A standard amenity from a fixed list, or a custom one on a single space.
- **Seat**: A bookable place in one space, with a label, an optional cubicle or zone, and optional features. It uses the shared calendar or its own.
- **Slot**: A daily time window a space offers (day, night, 24-hour or working hours), derived from the space's opening hours and shift change time.
- **Pass price**: The price of one pass length (day, week or month) for one slot of a space.
- **Availability calendar**: A start date, an optional end date and days of the week. There is one shared calendar per space and optional per-seat calendars.
- **Occupancy mark**: An owner's block on a seat for a date range, with a private note.
- **Booking**: One renter's reservation of one seat for one slot over the days of a pass. Records the pass, slot, period, price and currency, and whether it is active or cancelled.
- **Layout**: A space's floor plan, made of positioned seats, cubicles and labelled areas.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new owner can sign up, list a space with 20 seats, set prices and publish it in under 10 minutes without help.
- **SC-002**: A renter can go from the dashboard to a confirmed booking in under 60 seconds, using only clicks or keys, without typing an address.
- **SC-003**: Search results appear in under 1 second for 95% of searches with 1,000 published spaces.
- **SC-004**: Seat availability for a monthly pass on a space with 200 seats appears in under 1 second for 95% of requests.
- **SC-005**: In a test that fires 20 simultaneous bookings for the same seat and overlapping periods, exactly 1 succeeds, every time. The same holds when a booking races an occupied mark.
- **SC-006**: 100% of successful bookings produce the renter and owner emails within 1 minute under normal operation.
- **SC-007**: Automated accessibility checks report zero WCAG 2.1 AA violations on every screen in this feature, including the layout editor.

## Assumptions

- Payment happens outside BSeat. There is no "paid" status, invoice or refund in this feature.
- A weekly or monthly pass holds the **same seat** for the whole period.
- A pass length counts calendar days from the start date (7 or 30). Unavailable days inside the period are skipped and do not change the price.
- The day/night split is always 12 + 12 hours from one shift change time. Custom shift lengths are out of scope.
- A fixed-hours space has one slot per day, so a seat takes at most one booking per day there.
- City and area are free text typed by the owner, matched without regard to case or surrounding spaces. Map pins, geocoding and distance search are out of scope.
- The country list and currency list are standard lists (ISO country and currency codes). The time zone is suggested from the country and can be changed.
- Owners cannot book seats in their own spaces, but can book seats in other owners' spaces with the same account. Renters cannot list spaces.
- Owners cannot cancel or move renters' bookings, message renters, or approve bookings. Bookings are confirmed instantly.
- There is no admin moderation of listings, no reviews or ratings, no photos, no recurring or auto-renewing passes, and no waitlist.
- The hourly booking flow and its rules from feature 001 (07:00–20:00 window, 15-minute steps, 10-hour maximum) are retired. Existing hourly bookings are kept for history only. The 30-day horizon, no-double-booking and one-booking-at-a-time rules carry over.
- The seeded demo spaces from feature 001 are given to a seeded demo owner, with example slots, prices, calendar and a sample layout.
- Changing role after sign-up and deleting a space are out of scope (unpublish instead).
