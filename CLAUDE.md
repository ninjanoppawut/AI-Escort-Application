# CLAUDE.md — Wireframe and Product Design Brief

## Mission

Design the complete wireframe, user flow, information architecture, and visual interface for the **AI Escort Application** before implementation begins.

This phase is **design-only**. Do not build production code, database migrations, API routes, CI workflows, deployment configuration, or backend architecture. The repository documentation already defines the product rules and technical direction. Your responsibility is to turn those requirements into a coherent, testable, mobile-first product design.

The primary deliverables are:

1. Product information architecture
2. Student and teacher user flows
3. Complete screen inventory
4. Low-fidelity wireframes
5. High-fidelity visual direction
6. Reusable UI component system
7. Interaction and state specifications
8. Responsive behavior for mobile, tablet, and desktop
9. A clickable or clearly linked prototype flow when supported
10. Design handoff notes for the future implementation agent

## Source of truth

Read these files before designing:

1. `docs/DECISIONS_AND_QUESTIONS.md`
2. `docs/PRODUCT_REQUIREMENTS.md`
3. `docs/สรุประบบ_AI_ESCORT_ภาษาไทย.md`
4. `docs/PLANT_SURVEY_PLUGIN.md`
5. `docs/API_AND_REALTIME.md`
6. `docs/DATABASE_DESIGN.md`
7. `docs/SYSTEM_ARCHITECTURE.md`
8. `docs/IMPLEMENTATION_PLAN.md`
9. `AGENTS.md`

Accepted product decisions must not be changed merely to simplify the design. When the documentation leaves a visual or interaction choice open, make a clear design decision and explain it briefly.

## Product summary

AI Escort is a school field-learning application for systematic plant exploration.

Teachers create classes, invite students, configure group formation, create activities and exploration sessions, manage groups, monitor the active group on a live map, review plant observations, request revisions, verify results, and view a completed plant map.

Students join a class, create or join a group, receive in-app invitations and notifications, participate when their group is active, photograph plants, receive provisional Gemini analysis, compare AI results with the real plant, correct the information, submit observations, revise when requested, and view the completed map.

## Design priorities

Design in this order:

1. Student mobile field experience
2. Student class and group experience
3. Teacher mobile monitoring and review
4. Teacher tablet and desktop management
5. Completed activity map and plant-detail experience
6. Admin only when needed for navigation completeness

The student field workflow is the most important experience in the product.

## Mobile-first requirement

Design first for phone widths around **360–430 px**.

Assume students may use the application:

- outdoors in bright light;
- while walking or standing;
- with one hand;
- with intermittent internet;
- on low- to mid-range Android phones;
- with limited attention;
- while wearing a school uniform and carrying other materials.

Mobile requirements:

- Primary actions should be reachable in the lower half of the screen.
- Minimum touch targets should be approximately 44 × 44 CSS pixels.
- Avoid hover-only interactions.
- Avoid dense tables on student mobile screens.
- Prefer cards, bottom sheets, focused forms, progress steps, segmented controls, drawers, and clear full-screen task modes.
- Always show sync, upload, location, AI-processing, and submission status clearly.
- Do not rely on color alone to communicate status.
- Respect mobile safe areas around camera cutouts and browser controls.
- Minimize typing during field exploration.
- Use concise Thai-first labels suitable for secondary-school students.

Teacher interfaces must also work on mobile, but may progressively enhance for tablet and desktop using split panes, denser lists, and map/detail layouts.

## Visual-design freedom

You may choose the visual direction, typography, spacing system, icon style, component style, and nature/technology balance.

The interface should feel:

- modern;
- trustworthy;
- educational;
- calm;
- nature-connected;
- appropriate for secondary-school students and teachers;
- not childish;
- readable outdoors;
- professional enough for research use.

Create a small design rationale covering:

- visual concept;
- typography;
- color roles;
- elevation and surface treatment;
- icon approach;
- map-marker system;
- accessibility considerations.

Thai is the default interface language. Design components for Thai text expansion and mixed Thai, English, and scientific plant names.

## Non-negotiable product rules to reflect in the design

### Classes and invitations

- Teacher creates a class.
- Teacher sets group-size rules, maximum groups, and whether group formation is open.
- Teacher invites students using a code, link, or QR code.
- Communication is through in-app notifications for the MVP; email is not required.

### Student groups

- A student may belong to only one current group per class.
- A student may create only one group in a class.
- The student who successfully creates a group automatically becomes its leader.
- A group has exactly one leader.
- Group creation is available only while formation is open and a group slot remains.
- When the maximum number of groups is reached, show the Create Group action as disabled with a clear reason rather than making it disappear unexpectedly.
- A leader invites eligible classmates through in-app notifications.
- Students accept or decline invitations in the application.
- Teachers may move students, change leaders, delete unused groups, and archive historical groups.
- Moving a leader requires selecting or assigning a replacement leader.

### Realtime behavior in the design

Design visible states for:

- another student claiming the last group slot;
- class/group data refreshing;
- notification arriving;
- student becoming ineligible for another invitation;
- teacher moving a student;
- group becoming full;
- group being approved, locked, archived, or deleted.

The UI should update immediately, but must also clearly recover after reconnecting or returning to the app.

### Exploration sessions

- Only one group may be active in a session at a time.
- Waiting groups may preview the activity and route but cannot publish live location or submit observations.
- The active group receives a clear field-mode experience.
- Teacher manually activates groups and manually completes the session.

### Plant observations

- Each observation belongs to one student.
- Capture location and capture time are the authoritative plant-marker data.
- One observation supports 1–10 images.
- At least one whole-plant image is required.
- Gemini analysis is provisional.
- Student must compare AI traits against the real plant.
- Student can mark traits as matching, not matching, unsure, or not visible.
- Student can correct the AI values.
- Student must provide a Thai/common name, scientific name, and evidence note before submission.
- Manual entry remains available when Gemini fails or is pending.
- The same-species warning does not block submission.
- Teacher can verify, correct, request revision, mark unable to verify, or reject.
- Revision edits the same observation and preserves history.
- Draft observations do not appear on the teacher map.

### Map and plant detail

- Plant markers use capture location.
- Submitted and reviewed observations appear with status-aware markers.
- Marker states need icon, shape, label, or pattern support in addition to color.
- Teacher can tap a marker to open plant details without losing map context.
- After the activity ends, authorized students and teachers can view the completed map.
- Tapping a completed marker opens the plant detail view.

## Required student journeys

Design complete end-to-end flows for at least the following.

### Journey S1 — Join class

```text
Open invite link / scan QR / enter code
→ authenticate if required
→ preview class and teacher
→ confirm Join Class
→ enter class home
```

Include invalid, expired, disabled, and already-joined states.

### Journey S2 — Create a group

```text
Class home
→ Group section
→ Create Group
→ name group
→ confirm
→ become leader
→ invite classmates
```

Include:

- no available group slots;
- another student taking the last slot;
- group formation closed;
- student already in a group;
- minimum and maximum group size;
- group readiness.

### Journey S3 — Respond to group invitation

```text
Notification
→ open invitation
→ review leader and members
→ accept or decline
→ group membership updates
```

Include already joined elsewhere, invitation cancelled, expired, and group full states.

### Journey S4 — Wait for exploration

```text
Activity detail
→ see route and instructions
→ see group queue/status
→ wait for teacher activation
```

The difference between waiting, ready, active, paused, and completed must be obvious.

### Journey S5 — Active field exploration

```text
Group becomes active
→ enter field mode
→ view map, boundary, route, and group status
→ start plant observation
```

This experience should minimize navigation and keep the main actions reachable with one hand.

### Journey S6 — Capture and submit plant observation

```text
Start observation
→ capture GPS/time
→ take whole-plant image
→ optionally add up to nine more images
→ images compress/upload
→ Gemini queued/running
→ review candidates and visible traits
→ compare with real plant
→ correct values
→ enter required names and evidence
→ same-species warning if applicable
→ submit
```

Include:

- GPS unavailable;
- no internet;
- image upload retry;
- AI pending;
- AI failed;
- manual entry;
- same-species warning;
- draft recovery;
- submission success.

### Journey S7 — Revision

```text
Revision notification
→ open teacher feedback
→ compare previous submission
→ edit observation/add evidence
→ resubmit
→ see resubmitted status
```

### Journey S8 — Completed activity map

```text
Completed activity
→ open result map
→ filter or browse markers
→ tap marker
→ open plant details
```

## Required teacher journeys

### Journey T1 — Create class and invite students

```text
Create Class
→ enter class details
→ configure group rules
→ generate code/link/QR
→ share invitation
→ monitor joined students
```

### Journey T2 — Manage groups

```text
Class groups
→ view forming/ready/full/locked groups
→ open group
→ move student / change leader / remove student
→ approve or lock group
```

Include:

- moving a normal member;
- moving a leader and choosing a replacement;
- destination group full;
- returning student to unassigned;
- deleting an unused group;
- archiving a group with history;
- notifications sent to affected students.

### Journey T3 — Create activity and session

Design a manageable step flow for:

- activity details;
- boundary;
- route;
- checkpoints;
- session date/status;
- group assignment and queue order.

Do not overcomplicate the first-use experience.

### Journey T4 — Live session control

```text
Open session
→ view group queue
→ activate one group
→ monitor map and student status
→ pause/complete group
→ activate next group
→ complete session manually
```

The teacher must understand which group is active and what actions are irreversible or sensitive.

### Journey T5 — Observation review

```text
New submission notification
→ review queue or map marker
→ open plant detail
→ inspect images, location/time, Gemini result, student corrections, and same-species tag
→ verify / correct / request revision / unable to verify / reject
```

### Journey T6 — Completed map and reporting

```text
Completed session
→ result map
→ filter markers by status/group/species
→ open plant detail
→ review final teacher identity and history
```

## Required screen inventory

At minimum, design these screens or states.

### Shared

- Sign in
- Create account
- Reset password
- Role-aware home
- Notification center
- Notification detail/deep link
- Profile/settings
- Offline/reconnecting banner
- Permission denied
- Empty state
- Generic error/retry

### Student

- Join class by code
- Invite preview
- Student home
- Class home
- Class members overview
- Group empty state
- Create Group
- Group detail as leader
- Group detail as member
- Invite classmates
- Group invitation detail
- Activity list
- Activity detail/waiting state
- Field-mode map
- Start observation
- Camera/image gallery
- Image processing/upload state
- Gemini waiting state
- Gemini result and candidate selection
- Trait verification
- Manual plant entry
- Same-species warning
- Observation review before submit
- Submission success
- My observations
- Observation status/detail
- Revision feedback
- Edit and resubmit
- Completed activity map
- Completed plant detail

### Teacher

- Teacher home
- Class list
- Create/edit class
- Invite students/code/link/QR
- Class member list
- Group overview
- Group detail
- Move student flow
- Change leader flow
- Delete/archive group confirmation
- Activity list
- Create/edit activity
- Boundary/route/checkpoint design
- Session setup
- Session group queue
- Live teacher map
- Active-group control sheet
- Observation review queue
- Teacher plant detail/review
- Revision request
- Verification/correction form
- Completed activity map
- Completed plant detail
- Basic report/export entry point

## Navigation expectations

Keep navigation shallow and predictable.

Suggested student structure:

- Home
- Class/Group
- Active Activity
- My Observations
- Notifications

During an active session, use a dedicated field-mode shell prioritizing:

- Map
- Add Observation
- My Current Observations
- Group/Session Status

Suggested teacher structure:

- Home
- Classes
- Activities
- Live Session
- Reviews
- Notifications

You may improve these structures when a clearer solution exists, but explain the change.

## Key components to design

Create reusable components and variants for:

- top app bar;
- bottom navigation;
- notification bell and unread badge;
- status chip;
- class card;
- group card;
- member row;
- leader badge;
- group-capacity indicator;
- invitation card;
- route/activity card;
- queue position card;
- map marker and marker cluster;
- map bottom sheet;
- plant card;
- image capture tile;
- upload/AI progress state;
- trait verification row;
- confidence indicator;
- same-species warning;
- evidence note input;
- teacher review action bar;
- confirmation dialog;
- offline/retry banner;
- empty, loading, skeleton, and error states.

## Status system

Define a consistent status system covering at least:

### Group

- forming
- ready
- approved
- locked
- archived

### Session group

- waiting
- ready
- active
- paused
- completed

### Observation

- local draft
- images uploading
- AI queued
- AI running
- AI failed
- student review
- submitted
- teacher review
- revision required
- resubmitted
- verified
- unable to verify
- rejected

Recommended teacher map colors may start from:

- submitted/review: amber;
- revision required: red;
- resubmitted: blue;
- verified: green;
- unable to verify: purple;
- rejected: gray.

You may refine the palette, but status must remain readable without color.

## Design states and edge cases

Every critical flow should include:

- loading;
- empty;
- success;
- validation error;
- permission denied;
- offline;
- reconnecting;
- stale data refreshing;
- concurrent update conflict;
- action no longer available;
- destructive confirmation;
- retry after failure.

Do not design only the happy path.

## Accessibility

- Maintain readable contrast suitable for outdoor use.
- Use text and icons in addition to color.
- Use clear focus states.
- Support keyboard navigation for teacher desktop screens.
- Avoid tiny map controls.
- Use plain Thai language for important actions and errors.
- Do not hide critical information only inside tooltips.
- Consider users with color-vision differences.
- Design scientific names distinctly but legibly, preferably supporting italic styling.

## Responsive expectations

Provide behavior for:

- Mobile: 360–430 px
- Large mobile/small tablet: approximately 600–768 px
- Tablet/desktop teacher views: 1024 px and above

Student field interactions remain mobile-oriented even on larger screens.

Teacher desktop may use:

- split map/detail view;
- side navigation;
- denser class/group lists;
- resizable review panels;
- persistent filtering.

## Deliverable format

Produce the design in this sequence:

### Phase 1 — Product structure

- role-based sitemap;
- screen inventory;
- student and teacher journey diagrams;
- navigation proposal;
- key assumptions.

### Phase 2 — Low-fidelity wireframes

Create low-fidelity wireframes for all critical journeys, prioritizing:

1. Student class/group flow
2. Student active field flow
3. Student observation flow
4. Teacher class/group management
5. Teacher live-session control
6. Teacher observation review
7. Completed activity map

### Phase 3 — Visual system

Define:

- design concept;
- typography;
- colors and semantic status colors;
- spacing;
- radii;
- icons;
- buttons;
- form fields;
- cards;
- sheets/dialogs;
- map markers;
- loading/error/offline states.

### Phase 4 — High-fidelity screens

Create high-fidelity versions of the primary screens and enough secondary screens to demonstrate the system consistently.

### Phase 5 — Prototype and handoff

Provide:

- linked critical flows where supported;
- component inventory;
- responsive notes;
- interaction notes;
- state-transition notes;
- Thai copy examples;
- implementation handoff annotations;
- unresolved design questions, limited only to decisions that materially affect user behavior.

## Out of scope for this design phase

Do not spend time deciding or creating:

- CI/CD;
- GitHub Actions;
- deployment pipelines;
- database migrations;
- SQL constraints;
- backend implementation;
- API code;
- worker code;
- production authentication wiring;
- package manager;
- repository structure;
- test infrastructure;
- final Gemini JSON schema.

You may reference required data and states so the design can support them, but do not implement them.

## Design completion criteria

The design phase is complete when:

- all critical student and teacher journeys are represented;
- mobile student use is clearly prioritized;
- class/group leadership and invitation behavior is understandable;
- concurrent group-slot and Realtime update states are designed;
- field observation works under weak connectivity;
- AI uncertainty and manual fallback are clear;
- teacher review and revision are complete;
- completed map and plant details are designed;
- loading, empty, offline, error, conflict, and permission states exist;
- the component system is consistent;
- the result is ready for implementation handoff without requiring the implementation agent to invent major UX behavior.
