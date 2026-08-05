# MGT — Teacher Group Management

## Outcome

Teachers reorganize groups safely without violating capacity, leadership, active-session, or historical-integrity rules.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §7
- `docs/DECISIONS_AND_QUESTIONS.md` D-042–D-045, D-047, D-059
- `docs/API_AND_REALTIME.md` §§9–10
- `docs/DATABASE_DESIGN.md` §5
- `docs/UI_CONTRACTS.md` §§2, 5–6

## Scope

In scope: unassigned-student board, teacher-created groups, move/remove student, leadership change, approve, lock/unlock, reset creation claim, delete unused group, archive historical group, invitation cancellation, audit, and notifications.

Out of scope: exceeding maximum groups, rewriting session snapshots, ordinary membership changes during active participation, and silent leader reassignment.

## Functional requirements

- **MGT-001:** Teachers can view all current groups and unassigned students only within an authorized class.
- **MGT-002:** A teacher can create a group only within the same absolute maximum-group constraint used for student creation.
- **MGT-003:** Moving a student atomically validates teacher permission, same-class source/destination, destination capacity, uniqueness, and active-session restrictions.
- **MGT-004:** Moving/removing a leader from a non-empty group requires a successor from that group in the same transaction.
- **MGT-005:** Leadership transfer never leaves a populated group without exactly one active leader.
- **MGT-006:** A teacher can approve, lock, unlock, and reset a student's creation claim with append-only history.
- **MGT-007:** An unused group may be deleted; pending invitations are cancelled, members become unassigned or are moved explicitly, and the slot is restored.
- **MGT-008:** A group with session history is archived and remains visible in historical observations, maps, reports, and research data.
- **MGT-009:** Affected students receive durable notifications and group clients receive a private invalidation signal after commit.

## Authorization and transaction boundary

All state-changing operations are trusted atomic RPCs or equivalent transactions. They authorize `auth.uid()` as a teacher of the class, lock affected rows in a consistent order, enforce constraints in PostgreSQL, and emit history/events only after validation succeeds.

## Required states and failures

Destination full, last leader, successor required, active session, stale membership, maximum groups reached, historical archive instead of delete, permission denied, and concurrent update conflict must be explicit.

## Verification

- Atomic move tests for member and leader cases.
- Capacity, cross-class, active-session, and one-leader rejection tests.
- Delete-versus-archive history-preservation tests.
- Notification, audit-history, and Realtime invalidation tests.

## Dependencies

AUTH, NOT, GRP, and session-history lookup from SES.

## Definition of done

Every teacher operation preserves current invariants and immutable history under success, failure, and concurrent execution.
