# Feature Specification: Space photos

**Feature Branch**: `spec/003-space-photos` (built stacked on `dev/002-integration`)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "add space photos, so people know how their space looks. Also put some dummy space photos from the internet in the testing data."

**Decisions given with the request (2026-10-28)**:

- An owner can add up to **10 photos** per space, reorder them and delete them. The **first photo is the cover**.
- The cover appears on search result cards ("Find a space"). The listing page shows a gallery. The owner manages photos from the owner pages of the space (the space pages from spec 002: Details, Seats, Passes and prices, Layout, Availability, Bookings).
- This is a separate feature, 003. It builds on spec 002 (space marketplace), is demoed together with it, and is released after it.
- About 8–10 free-licensed office and coworking photos (Unsplash or Pexels) are resized to about 1600 pixels on the long edge, kept in the project with a credits file, and attached to the seeded demo spaces. After that, seeding works offline.

**Depends on**: spec 002 (owner and renter roles, spaces and their draft/published/unpublished status, "Find a space", the listing page, the demo owner and the seeded London HQ and Pune Hub spaces). Terms such as owner, renter, space, listing, published and unpublished mean what they mean in `specs/002-space-marketplace/spec.md`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Add photos to my space (Priority: P1)

As a space owner, I add photos of my space from my device, see each upload's progress, retry
any that fail, and describe each photo, so renters can see what my space looks like.

**Why this priority**: No photo can be shown until an owner can add one. It is the base for
every other story.

**Independent Test**: As an owner, open a draft space's photos section, choose 3 valid files
and 1 file that is too large. Confirm the 3 are added with progress shown, the large one fails
with a reason, and the 3 photos are listed in the order chosen with the first marked as cover.

**Acceptance Scenarios**:

1. **Given** I own a space (draft, published or unpublished), **When** I open its owner pages, **Then** I can reach a "Photos" section from the space's navigation, next to Details, Seats, Passes and prices, Layout, Availability and Bookings.
2. **Given** the space has no photos, **When** I open the Photos section, **Then** I see an empty state that explains photos help renters choose, that the first photo is the cover, and the accepted formats and maximum size, with a control to add photos.
3. **Given** I choose one or more JPEG, PNG or WebP files of up to 10 MB each, **When** they upload, **Then** each file shows its own state (waiting, uploading with a percentage, processing, added) and the states are announced to screen-reader users.
4. **Given** a file fails (wrong format, too large, too small, unreadable, connection lost), **When** it fails, **Then** that file shows "failed" with the reason in plain words, the other files carry on, and I can retry a failed file without choosing it again, or dismiss it.
5. **Given** a file is waiting or uploading, **When** I cancel it, **Then** it stops, is not added, and does not count toward the limit.
6. **Given** a photo is added, **When** I look at the list, **Then** it appears after the existing photos, and if it is the space's first photo it is marked as the cover.
7. **Given** a photo is added, **When** I give it a description (optional, up to 150 characters), **Then** the description is saved, shown to renters as the photo's caption and used as its text alternative. Without a description, its text alternative is "<space name> photo N", where N is its position.
8. **Given** I upload a photo taken on a phone with location data and a rotated orientation, **When** it is added, **Then** no version of the photo keeps the location data, and it displays upright as it was taken.
9. **Given** I have unfinished uploads, **When** I try to leave the page, **Then** I am warned that unfinished uploads will be cancelled. Photos already added stay.

---

### User Story 2 - See what a space looks like (Priority: P1)

As someone who needs a space, I see each space's cover photo in my search results and browse
all its photos on the listing page, so I can judge the space before I book.

**Why this priority**: This is the value the request asks for. With User Story 1 it is a
complete, demoable slice.

**Independent Test**: Give one published space 4 photos and leave another with none. As a
renter, search their city. Confirm the first card shows the cover and the second a neutral
placeholder, and that the first listing page shows all 4 photos in the owner's order, by
pointer and by keyboard.

**Acceptance Scenarios**:

1. **Given** a published space has photos, **When** it appears in "Find a space" results, **Then** its card shows the cover photo with its text alternative.
2. **Given** a published space has no photos, **When** it appears in results or I open its listing page, **Then** I see a neutral placeholder of the same shape that does not look like a real space and is announced as "No photos yet". The card and page layout are the same as with a photo.
3. **Given** I open a listing page for a space with photos, **When** the page loads, **Then** I see a gallery that starts with the cover, shows how many photos there are, and shows each description as a caption.
4. **Given** the gallery, **When** I open a photo, **Then** I see it large and whole (not cropped), with its position ("3 of 7"), and I can move to the next and previous photo and close the view by keyboard, pointer or touch. Closing returns focus to the photo I opened.
5. **Given** a space is draft or unpublished, **When** I am a renter, **Then** I cannot see its photos on any page, exactly as I cannot see the listing itself (spec 002).
6. **Given** the owner adds, reorders, describes or deletes photos of a published space, **When** I next load the search results or the listing page (at most 1 minute later), **Then** I see the change.
7. **Given** I view search results, **When** covers load, **Then** each card gets a photo version sized for a card, not the large gallery version.

---

### User Story 3 - Arrange and remove photos (Priority: P2)

As an owner, I change the order of my photos to choose the cover, and delete photos I no longer
want, knowing that deletion is permanent.

**Why this priority**: Owners need to pick the best cover and fix mistakes, but a space with
photos in upload order already gives renters value.

**Independent Test**: With 5 photos, move the 4th to first place using only the keyboard,
delete the 2nd after confirming, and confirm renters see the new cover and 4 photos in the new
order, and that the deleted photo cannot be found anywhere.

**Acceptance Scenarios**:

1. **Given** a space has two or more photos, **When** I move a photo to another position, **Then** the new order is saved and renters see photos in that order. I can do this by dragging, and also by keyboard and single clicks (move earlier, move later, make cover) without dragging.
2. **Given** I move a photo to the first position, **When** the order is saved, **Then** it becomes the cover everywhere the cover is shown.
3. **Given** I choose to delete a photo, **When** I am asked to confirm, **Then** the message says the photo will be deleted permanently and cannot be restored.
4. **Given** I confirm the deletion, **When** it completes, **Then** the photo disappears from every page at once, the remaining photos close the gap in the same order, and if it was the cover the next photo becomes the cover.
5. **Given** I delete the last photo, **When** it completes, **Then** renters see the placeholder again.
6. **Given** a space belongs to another owner, **When** I try to add, describe, reorder or delete its photos (for example by guessing an address), **Then** the request is refused exactly as if the space did not exist.

---

### User Story 4 - Respect the 10-photo limit (Priority: P2)

As an owner, I know how many photos I can still add, and I am told clearly what happens when
I reach the limit of 10.

**Why this priority**: The limit is a product rule that must hold, but it only matters once
owners add many photos.

**Independent Test**: With 8 photos, choose 4 files. Confirm the first 2 are added, the other
2 are listed as not added because of the limit, and the add control is then unavailable with
an explanation.

**Acceptance Scenarios**:

1. **Given** a space has fewer than 10 photos, **When** I open the Photos section, **Then** I see how many photos the space has and how many more I can add (for example "7 of 10 photos").
2. **Given** a space has 10 photos, **When** I open the Photos section, **Then** the add control is unavailable and a message says the space has the maximum of 10 photos and that deleting one makes room.
3. **Given** a space has N photos and I choose more than 10 − N files, **When** the upload starts, **Then** only the first 10 − N files in the order I chose them are uploaded, and each of the rest is listed as "not added: this space already has 10 photos".
4. **Given** I upload from two browser tabs or devices at the same time near the limit, **When** both finish, **Then** the space never has more than 10 photos, and any upload over the limit fails with the limit message.

---

### User Story 5 - Demo spaces come with photos (Priority: P3)

As someone testing or demoing BSeat, I get seeded demo spaces that already have realistic,
properly credited office photos, without needing an internet connection.

**Why this priority**: It makes demos and manual testing realistic, but no owner or renter
depends on it.

**Independent Test**: On a fresh environment with no internet access, run the seed twice.
Confirm London HQ and Pune Hub each have their photos in the intended order, with
descriptions, that the credits file lists every photo, and that a renter's search shows their
covers.

**Acceptance Scenarios**:

1. **Given** a fresh environment, **When** the seed runs, **Then** London HQ gets 5 photos and Pune Hub gets 4, each with a description, in a fixed order with a fitting cover.
2. **Given** the seed has already run, **When** it runs again, **Then** no photos are duplicated and no space exceeds 10 photos.
3. **Given** the environment has no internet access, **When** the seed and the automated tests run, **Then** they succeed, because every photo they use is kept in the project.
4. **Given** the project's seed photos, **When** I open the credits file, **Then** each photo lists its file name, photographer, source page, license and the date it was retrieved.

### Edge Cases

- A file named `.jpg` that is really a PDF or a script is refused as an unsupported format. The format is judged from the file's content, not its name.
- A corrupt or truncated image file is refused with "this file could not be read as an image".
- An image under 10 MB but with huge dimensions (for example 20,000 × 20,000 pixels) is refused as too large.
- An image smaller than 800 pixels on its long edge is refused as too small to look good in the gallery.
- An animated image (animated WebP or PNG) is refused. GIF, HEIC, SVG and RAW files are refused with the list of accepted formats.
- The connection drops mid-upload. The file shows "failed: connection lost" and can be retried. Nothing half-uploaded is ever shown or counted.
- The owner's session ends mid-upload. Unfinished files fail with a message to sign in again. Photos already added stay.
- One tab reorders while another deletes a photo. The final order has no gaps or duplicates and every remaining photo appears exactly once.
- The same picture is uploaded twice. Both are kept and both count toward the limit.
- A portrait photo on a landscape card. The card fills its shape and may crop the edges; the gallery's large view always shows the whole photo.
- The owner renames the space. Default text alternatives ("<space name> photo N") follow the new name.
- A description contains markup or a script. It is shown as plain text, never run or rendered as formatting.
- A space with one photo. Reorder controls are not offered.
- A space is unpublished while a renter has its listing open. On the next load the renter sees the same "not available" result as spec 002, without photos.
- A space is unpublished and later republished. Its photos are kept and reappear in the same order.

## Requirements _(mandatory)_

### Functional Requirements

**Managing photos (owner)**

- **FR-001**: Each space MUST have a Photos section in the owner's space pages, reachable from the space's navigation, for spaces in any status (draft, published, unpublished).
- **FR-002**: Owners MUST be able to add photos to their spaces by choosing one or more files at once. A space MUST NOT have more than 10 photos at any time, including under simultaneous uploads.
- **FR-003**: The system MUST accept only still JPEG, PNG and WebP images of at most 10 MB, at least 800 pixels and at most 12,000 pixels on the long edge, and at most 50 megapixels. The format MUST be judged from the file content. Anything else MUST be refused with a message naming the rule that failed and the accepted formats and limits.
- **FR-004**: When a selection exceeds the remaining room, the system MUST upload only the first files in the selection order that fit, and list each other file as not added because of the limit. At 10 photos the add control MUST be unavailable, with a message that deleting a photo makes room. The section MUST show the current count against the limit (e.g., "7 of 10 photos").
- **FR-005**: Each file in an upload MUST show its own state: waiting, uploading (with progress as a percentage), processing, added, failed (with a plain-language reason) or not added (limit). Failed files MUST be retryable without choosing the file again, and waiting or uploading files MUST be cancellable. One file's failure MUST NOT stop the others. State changes MUST be announced to assistive technology.
- **FR-006**: A photo MUST count toward the limit and be visible to anyone only once it is fully added. A failed or cancelled upload MUST leave nothing visible and nothing counted.
- **FR-007**: Leaving the Photos section while uploads are unfinished MUST ask for confirmation, and confirming cancels them.
- **FR-008**: Owners MUST be able to give each photo an optional plain-text description of up to 150 characters and change it at any time. The description is the photo's caption and text alternative. Without one, the text alternative MUST be "<space name> photo N", where N is the photo's current position.
- **FR-009**: Owners MUST be able to move any photo to any position. Every reorder action MUST work by keyboard and with single clicks or taps, without dragging. The order MUST be saved, and the first photo is the cover.
- **FR-010**: Owners MUST be able to delete a photo after a confirmation that states deletion is permanent. A deleted photo MUST disappear from every page at once and cannot be restored, its files MUST be removed from storage within 24 hours, and the remaining photos MUST keep their order without gaps. Deleting the cover makes the next photo the cover.
- **FR-011**: Only the space's owner MUST be able to add, describe, reorder or delete its photos. For anyone else, including other owners, these requests MUST behave as if the space does not exist (spec 002 FR-009).
- **FR-012**: Photos MUST NOT be required to publish a space. The publishing rules of spec 002 (FR-008) are unchanged.

**Privacy and file handling**

- **FR-013**: No stored or served version of a photo, including any kept original, MUST contain location (GPS) metadata or other personal metadata such as the camera owner's name or the device serial number.
- **FR-014**: Photos MUST display upright as they were taken, whatever orientation the camera recorded.
- **FR-015**: The original file name MUST NOT be shown to renters.

**Showing photos (renter)**

- **FR-016**: Each "Find a space" result card MUST show the space's cover photo, or a neutral placeholder announced as "No photos yet" when the space has none. The card layout MUST be the same either way.
- **FR-017**: The listing page MUST show a gallery of all the space's photos in the owner's order, starting with the cover, with the photo count and each description as a caption. Opening a photo MUST show it large and uncropped with its position ("3 of 7"), next, previous and close controls usable by keyboard, pointer and touch, and focus MUST return to the opened photo on close. A space without photos MUST show the placeholder instead.
- **FR-018**: Each place that shows a photo MUST receive a version sized for that place: a small version for result cards and a larger version for the gallery. A results card MUST NOT load the gallery-sized version.
- **FR-019**: Renters MUST see photos only of published spaces. Photos of draft or unpublished spaces MUST NOT be shown to renters on any page. [NEEDS CLARIFICATION: must a photo's address that a renter saved earlier stop working once the space is unpublished or the photo is deleted, and how fast?]
- **FR-020**: Owners MUST always be able to see all photos of their own spaces in the Photos section, whatever the space's status.
- **FR-021**: Changes to a published space's photos (added, described, reordered, deleted) MUST be visible to renters within 1 minute.
- **FR-022**: Viewing photos MUST require sign-in, like every feature in spec 002 (FR-005).

**Demo and test data**

- **FR-023**: The project MUST include 8–10 office and coworking photos under a free license (Unsplash License or Pexels License), resized to about 1600 pixels on the long edge, with no location metadata, and a credits file listing each photo's file name, photographer, source page, license and retrieval date.
- **FR-024**: The seed MUST attach these photos to the seeded demo spaces (London HQ: 5, Pune Hub: 4), each with a description, in a fixed order. Running the seed again MUST NOT duplicate photos or exceed the limit.
- **FR-025**: The seed and all automated tests MUST work with no internet access. They use only photos kept in the project or images generated by the tests.

**Quality**

- **FR-026**: Every screen and state in this feature (Photos section, result cards, listing gallery and its large view) MUST meet WCAG 2.1 AA and show loading, empty, error and success states (spec 002 FR-032).

### Key Entities

- **Space photo**: One image that belongs to exactly one space. It has a position among the space's photos (1–10, no gaps), an optional description, the time it was added, and versions sized for different places (card, gallery, large view). It is visible to renters only when it is fully added and its space is published.
- **Cover**: Not stored separately. It is the space photo in position 1.
- **Photo upload**: A single file the owner is adding, with its state (waiting, uploading, processing, added, failed, not added) and failure reason. It exists only while the owner is adding photos and becomes a space photo when added.
- **Seed photo credit**: For each photo kept in the project, the file name, photographer, source page, license and retrieval date.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can add 10 photos, set a different cover and describe each photo in under 5 minutes on a 20 Mbit/s connection, without help.
- **SC-002**: For 95% of uploads of up to 10 MB, the photo shows as added within 10 seconds after its upload finishes.
- **SC-003**: On a 10 Mbit/s connection, every cover on a results page of 20 spaces appears within 2 seconds for 95% of page loads, and the page loads no more than 2 MB of photo data in total.
- **SC-004**: On a 10 Mbit/s connection, the first gallery photo on a listing page appears within 2 seconds for 95% of page loads.
- **SC-005**: A test photo carrying GPS coordinates and a camera serial number, once uploaded, yields no stored or served version that contains either, in 100% of runs.
- **SC-006**: In a test that fires 15 simultaneous uploads at a space with no photos, exactly 10 are added, every time.
- **SC-007**: In tests, renters and other owners succeed in 0% of attempts to see photos of a draft or unpublished space, or to change another owner's photos.
- **SC-008**: Automated accessibility checks report zero WCAG 2.1 AA violations on the Photos section, the results page and the listing gallery, including its large view.
- **SC-009**: On a fresh environment with no internet access, the seed completes and a renter's search shows covers for both demo spaces.

## Assumptions

- **Formats and size**: JPEG, PNG and WebP still images up to 10 MB each, 800 to 12,000 pixels on the long edge and at most 50 megapixels. The upper bounds protect the service from oversized images; the lower bound keeps the gallery sharp. HEIC (the iPhone default) is not accepted; owners convert first, and the refusal message says so.
- **Text alternative**: an optional description (up to 150 characters) that is both caption and text alternative, defaulting to "<space name> photo N". This keeps adding many photos quick. The Photos section encourages descriptions ("Describe this photo for people who use screen readers") but does not require them.
- **Cover**: the photo in position 1 is the cover; there is no separate "cover" setting. "Make cover" moves a photo to position 1.
- **Publishing**: photos are not required to publish a space.
- **When photos can be added**: after the space exists (draft or later), from the Photos section. The create-space form from spec 002 does not change.
- **Where photos show**: on "Find a space" result cards (cover only) and on the listing page (gallery). Dashboards, bookings lists, the seat layout and emails do not show photos in this feature.
- **Visibility**: renter visibility follows the listing's status. Unpublishing hides the photos from renters but keeps them; republishing shows them again. Sign-in is required to see them, as for every page in spec 002.
- **Storage**: photos are stored in object storage. The architect chooses the storage and how sized versions are produced in the plan (see ADR-0007 for the AWS target).
- **Deletion**: deletion is permanent with no trash or undo. Files are removed from storage within 24 hours; copies in system backups expire with the normal backup retention.
- **Content and rights**: owners are responsible for having the right to use the photos they upload. There is no rights checkbox, review or moderation, consistent with spec 002 having no listing moderation.
- **Abuse limits**: beyond 10 photos of up to 10 MB per space, no extra storage quota applies in this feature.
- **Leaving mid-upload**: unfinished uploads are cancelled after a warning. They do not continue in the background.
- **Seed photos**: chosen from Unsplash or Pexels, whose licenses allow free use, including in software, without required attribution. Credits are kept anyway. They are downloaded once during implementation by someone with internet access and kept in the project under the API seed folder; nothing downloads them later. London HQ gets 5 and Pune Hub gets 4 (9 photos in total).

## Non-goals

- Video, 360° photos or virtual tours.
- Editing in the app: cropping, rotating, filters, brightness or other adjustments.
- Photos of individual seats, cubicles or layout areas. Photos belong to the whole space.
- Photos uploaded by renters, and reviews with photos.
- AI features: automatic tagging, generated descriptions or text alternatives, content moderation, or face or licence-plate blurring.
- GIF, HEIC/HEIF, SVG, RAW or animated images.
- Importing photos from a web address, cloud drive or another platform.
- Watermarks, renter downloads of the original, or zoom beyond the large view.
- Deleting several photos in one action, a trash bin, or undoing a deletion.
- Photos on dashboards, booking pages, emails or social sharing previews.
