# GRP — Student Group Formation

## Outcome

Eligible students form one valid group per class through atomic operations, with exactly one leader, consent-based invitations, clear slot availability, and authoritative Realtime refresh.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §§5–6
- `docs/DECISIONS_AND_QUESTIONS.md` D-033–D-041, D-047, D-050
- `docs/API_AND_REALTIME.md` §§6–9, 12
- `docs/DATABASE_DESIGN.md` §§4–5
- `docs/UI_CONTRACTS.md` §§2, 5

## Scope

In scope: group board, student group creation, creation claim, leader assignment, classmate eligibility, send/cancel/accept/decline invitations, readiness, capacity, and group Realtime invalidation.

Out of scope: leader force-add, offline slot reservation, student request-to-invite, and creating above the configured maximum.

## Functional requirements

- **GRP-001:** The group board shows authoritative groups, capacity, unassigned students, formation state, and why creation is unavailable.
- **GRP-002:** `create_student_group` locks class configuration and atomically validates membership, formation settings, maximum group count, current membership, and prior creation claim.
- **GRP-003:** Successful creation makes the creator the first and only active leader and records the creation claim.
- **GRP-004:** Under a final-slot race, exactly one eligible transaction succeeds; the other returns `GROUP_LIMIT_REACHED`.
- **GRP-005:** A student has at most one current forming/active group membership per class.
- **GRP-006:** A student can claim student-created group creation once per class until an audited teacher reset.
- **GRP-007:** A leader can invite only eligible classmates to the leader's own unlocked group.
- **GRP-008:** Invitation acceptance atomically revalidates invitation state, class membership, current group membership, and destination capacity.
- **GRP-009:** Classmates explicitly accept or decline; invitation cancellation/expiry and races return stable errors.
- **GRP-010:** Initial fetch plus private class signal triggers authoritative refetch on event, foreground, network reconnect, Realtime reconnect, and mutation completion.

## Authorization and invariants

- Partial unique constraints enforce one current group per student and one active leader per populated group.
- Maximum group count and capacity are database-enforced for students and teachers.
- SECURITY DEFINER RPCs, if required, live in a non-exposed schema, set a fixed `search_path`, check `auth.uid()`, restrict execute grants, and emit events.
- Cached UI never reserves a slot or decides eligibility.

## Required states and failures

Formation closed, creation disabled, no slot, final-slot loss, already in group, claim already used, group full, invitation expired/cancelled, stale refresh, offline, and permission denied are explicit.

## Verification

- Concurrent final-slot test.
- One-leader, one-current-group, one-creation-claim, and capacity constraint tests.
- Invitation acceptance race and revalidation tests.
- Private Realtime invalidation/refetch test without five-second primary polling.

## Dependencies

AUTH memberships/settings and NOT delivery.

## Definition of done

All invariants hold under concurrent clients, every mutation is authorized and audited, and mobile screens explain rather than hide unavailable actions.
