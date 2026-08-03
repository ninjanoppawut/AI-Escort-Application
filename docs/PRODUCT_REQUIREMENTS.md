# Product Requirements

## 1. Product vision

AI Escort is a school field-learning platform where an AI assistant guides students through a defined exploration area and a systematic plant-survey process. The application combines route navigation, collaboration, structured scientific observation, and ecological reflection.

The AI must support inquiry rather than replace it. It may suggest plant candidates, ask for better evidence, detect missing fields, and prompt ecological thinking. Teachers remain responsible for activity approval, live-session control, and final academic review.

## 2. Primary users

### Student

- Join a class using an invite code or link.
- Create or join a group in that class.
- Draft and submit an activity proposal when allowed.
- Join the active exploration session.
- Follow the route and checkpoints.
- Capture structured plant observations.
- Comment on or suggest identification for observations visible in the class.
- Complete reflection and assessment tasks.

### Teacher

- Create and manage classes.
- Invite and remove students.
- Review student-created groups and activities.
- Define route, boundary, checkpoints, requirements, schedule, and safety notes.
- Open, pause, resume, and complete sessions.
- Activate one group at a time.
- View live group location and progress.
- Send guidance and safety alerts.
- Review observations and verify identifications.
- Assess work and export data.

### Admin

- Manage schools, users, global roles, and system configuration.
- Manage AI providers, usage limits, reference taxonomies, and audit logs.
- Suspend abusive or unsafe content.

## 3. Core entities

```text
School
 └─ Class
     ├─ Memberships
     ├─ Groups
     └─ Activities
         ├─ Route and boundary
         ├─ Checkpoints
         ├─ Plugin configuration
         └─ Exploration sessions
             ├─ Queued groups
             ├─ Participants
             ├─ Location tracking
             ├─ Observations
             └─ Reflections and assessments
```

An **activity** is a reusable learning plan. A **session** is one actual execution of an activity on a specific date and time.

## 4. Critical business rules

1. Only active class members may access a class.
2. Students may create activities only in classes where the teacher enables this capability.
3. Student-created activities require teacher approval before scheduling.
4. A session may contain several groups, but only one group may be `active` at a time.
5. Only authorized teachers may activate or switch groups.
6. Students may publish location only while participating in an open session.
7. Student location must not become a public or school-wide social feature.
8. AI identification is always labeled as provisional.
9. Final plant verification must record the verifying person and timestamp.
10. Data collected offline must use idempotent client-generated IDs during synchronization.

## 5. Activity lifecycle

### Teacher-created

```text
draft → published → scheduled → active → completed → archived
```

### Student-created

```text
draft → submitted → under_review
                     ├─ approved → published
                     ├─ revision_required → draft
                     └─ rejected
```

An approved activity includes:

- title and description;
- class and creator;
- learning objectives;
- route and exploration boundary;
- checkpoints;
- expected duration and distance;
- minimum observation requirements;
- enabled survey plugins;
- safety instructions;
- reflection questions;
- visibility and schedule.

## 6. Exploration session lifecycle

```text
scheduled → open → paused → completed
                    └────→ cancelled
```

Group state:

```text
waiting → ready → active → completed
                   └────→ paused
```

Teacher controls must show the current active group and require a deliberate confirmation before switching. The switch operation must be atomic.

## 7. Functional requirements

### Class and membership

- Teacher creates class with name, academic term, subject, and optional school.
- System generates expiring invite code and share link.
- Teacher can disable an invite.
- Membership statuses: `invited`, `active`, `suspended`, `left`.

### Group management

- Teacher configures minimum and maximum group size.
- Students create a named group and invite classmates.
- Teacher may lock group membership before a session.
- A student may belong to only one group for a particular session unless the teacher explicitly reassigns them.

### Route builder

- Draw or import route as GeoJSON LineString.
- Draw exploration boundary as Polygon or MultiPolygon.
- Add ordered checkpoints and instructions.
- Validate that checkpoints are inside or near the boundary.
- Estimate distance and duration.

### Live exploration

- Display planned route, actual track, user location, group members, checkpoints, plant markers, and GPS accuracy.
- Display last update time for every member.
- Detect likely off-route and outside-boundary conditions using configurable tolerance and persistence duration.
- Avoid treating a single inaccurate GPS sample as an emergency.
- Allow teacher alerts and group acknowledgements.

### Observation

- Capture GPS, accuracy, timestamp, observer, group, and session.
- Capture required photos and structured fields.
- Support draft, pending sync, submitted, reviewed, and verified states.
- Preserve revision history for academically relevant fields.

### Reflection and assessment

- Student submits individual reflection after the session.
- Teacher can attach rubric criteria to an activity.
- System separates group observation score from individual reflection score.

## 8. Non-functional requirements

- Mobile-first interface; target modern mobile Safari and Chrome.
- Thai-first user interface with architecture ready for English.
- Graceful behavior on weak or intermittent networks.
- Accessible controls and readable map overlays.
- No secrets in client bundles.
- Audit logs for membership changes, approvals, session control, verification, and admin actions.
- Raw location retention must be configurable and minimized.
- Observations and tracks must be exportable as CSV and GeoJSON.

## 9. MVP acceptance scenarios

1. Teacher creates a class and students join using a code.
2. Students form two groups.
3. Teacher creates an activity with boundary, route, and three checkpoints.
4. Teacher opens a session and activates Group A.
5. A second attempt to activate Group B at the same time is rejected by the database.
6. Group A members see one another on the live map.
7. A student captures an offline observation and it syncs once online without duplication.
8. AI requests a missing leaf image and suggests possible taxa without overwriting the student's answer.
9. Teacher completes Group A, activates Group B, verifies observations, and exports results.