---
name: atomic-mutations
description: Concurrency-critical database operations for AI Escort — group creation and the final-slot race, leadership transfer, teacher move/delete/archive, session opening and snapshot, and one-active-group activation. Use when writing or reviewing any plpgsql function, RPC, transaction, unique index, or check constraint; when two users could act on the same row at once; when a `GROUP_LIMIT_REACHED`-class error code is involved; or when deciding whether correctness lives in application code or the database.
---

# Atomic mutations and concurrency

Source: `docs/SYSTEM_ARCHITECTURE.md` §6, `docs/API_AND_REALTIME.md` §7/§9/§20, D-003, D-034…D-045.

## Core principle

**The transaction prevents the race, not Realtime.** Realtime is a change signal. If correctness depends on a client refetching in time, the design is wrong.

## Operations that must be atomic

| Operation | Guard |
|---|---|
| `create_student_group` | Lock class config row, then validate + reserve slot |
| Leadership transfer | Old leader → member and new member → leader in one statement set |
| Teacher move student | Lock both groups; validate capacity, active session, successor |
| Delete / archive group | Cancel invitations, reassign members, restore slot — one transaction |
| Open session | Snapshot membership into `session_participants` |
| Activate group | Partial unique index + atomic RPC |
| Pause / resume session | Blocks submission while paused (`SESSION_PAUSED`); drafts stay editable |
| Complete one group | Ends that group's participation without ending the session |
| Invitation accept | Revalidate membership *and* capacity at accept time |
| Class invite use | Atomic usage-count increment |

## create_student_group — the canonical shape

```text
BEGIN
  SELECT ... FROM classes WHERE id = :classId FOR UPDATE   -- serializes the race
  assert class membership active
  assert allow_student_groups
  assert formation_status = 'open'
  assert student not in a forming/active group in this class
  assert no existing student creation claim for this class
  assert current_group_count < maximum_groups
  INSERT group
  INSERT creation claim
  INSERT group_member (role = leader)
  emit audit event + notifications
COMMIT
→ emit group.created signal
```

Two students on the final slot: one commits, one gets `GROUP_LIMIT_REACHED` and refetches the board. Never "both succeed then clean up later".

## Invariants enforced in the database, not the app

- Partial unique index: at most one active leader per group.
- Partial unique index: at most one `active` group per session (D-003).
- One forming/active group per student per class, leader or member (D-037).
- One student-created group claim per student per class (D-038) — deleting a group does **not** free the claim; only an explicit teacher reset does.
- `maximum_groups` and group capacity are teacher-configured and DB-enforced (PRD §6 rule 4, D-047). **No actor, including a teacher, bypasses them by a UI confirmation.** A teacher who needs another group raises the class setting first — there is no over-quota override.

## Blocked during an active session (D-045)

Move, remove, delete, and leadership change are refused with `GROUP_IN_ACTIVE_SESSION` while the affected group or student participates in a running session. Emergency removal is a separate, audited, teacher-supervised path.

## Leader movement (D-042)

Moving a leader out of a populated group requires `successorLeaderId` in the same call. A populated group must never commit with zero leaders. If the source group empties, the same workflow decides delete / archive / leave-empty.

## Delete vs archive (D-044)

- No session history → soft-delete, cancel pending invitations, return members to unassigned, **restore one group slot**.
- Has session history → archive only. Never hard-delete. Archived groups stay visible in historical maps, reports, and research data.

## Idempotency

- Observation drafts key on a client-generated UUID.
- Media and AI jobs use deterministic IDs / idempotency keys.
- Submission uses optimistic version checks → `OBSERVATION_VERSION_CONFLICT` on stale write.
- Retried mutations must not double-apply.

## Error codes

Return the stable codes in `docs/API_AND_REALTIME.md` §3. The UI maps each to distinct copy — never collapse `INVITE_INVALID`, `INVITE_EXPIRED`, and `INVITE_DISABLED` into one message.

## Required concurrency tests

1. Two clients race the final group slot → exactly one success.
2. Two leadership transfers race → never zero or two leaders.
3. Two group activations race → exactly one active group.
4. Accept invitation after the group filled → refused.
5. Move student while their session is active → refused.
6. Session snapshot survives a later group move unchanged.
