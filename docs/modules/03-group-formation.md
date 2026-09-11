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

## Implementation status

- **P3-01 complete:** group schema, current membership schema, student creation
  claims, append-only membership history, RLS, validation triggers, and core
  partial unique indexes live in
  `supabase/migrations/20260813050854_phase3_group_foundation.sql`.
- Verification lives in `supabase/tests/phase3_group_foundation_test.sql` and
  covers one active leader, one current group per student/class, one unreset
  creation claim, class/group consistency, append-only history, RLS isolation,
  browser write denial, helper hardening, FK indexes, and generated type
  refresh.
- **P3-02 complete:** `public.create_student_group(uuid,text,text)` in
  `supabase/migrations/20260911183206_phase3_create_student_group.sql` locks the
  class row and atomically enforces GRP-002–GRP-006. Domain denials return
  `outcome=denied` with a stable `error_code` so the denied audit row and
  `group_creation_failed` research event commit; authorization failures raise.
  `POST /api/groups` (`src/app/api/groups/route.ts`) validates with Zod and
  returns `201` or a `409` error envelope carrying slot counts.
- Verification lives in `supabase/tests/phase3_create_student_group_test.sql`,
  `supabase/tests/phase3_create_student_group_concurrency.ps1`, and
  `src/features/groups/*.test.ts`.
- **P3-03 complete:** `public.get_class_group_board(uuid)` in
  `supabase/migrations/20260911191650_phase3_group_board_read_model.sql`,
  `GET /api/classes/:id/group-board`, and the mobile `/classes/[classId]/groups`
  board (`src/features/groups/components/group-board.tsx`) implement GRP-001
  and every create-availability state. Create Group stays visible and is
  disabled with its reason; offline disables it because cached UI never
  reserves a slot. Verification: `phase3_group_board_test.sql`,
  `src/features/groups/**/*.test.ts(x)`, and the `P3-03` journey in
  `tests/e2e/group-formation.spec.ts`.
- **P3-04 complete:** `supabase/migrations/20260911194231_phase3_class_group_realtime.sql`
  emits pointer-only private Broadcast signals on `class:{classId}:groups` and
  restricts receipt to active class members; `useClassGroupRealtime`
  (`src/features/groups/client/realtime.tsx`) invalidates the authoritative
  board on signals and Realtime reconnect. Verification:
  `phase3_class_group_realtime_test.sql` and `realtime.test.tsx`.
- **P3-05 and P3-EXIT complete:** the browser race journey in
  `tests/e2e/group-formation.spec.ts` proves one success under a concurrent
  final-slot race and an observer refresh from the private signal.
- **P4-01:** `public.group_invitations`
  (`supabase/migrations/20260911195642_phase4_group_invitations_foundation.sql`)
  with one pending invitation per group and invitee, 24-hour default expiry,
  immutable identity and terminal states, participant-only RLS, and
  `group.invitation_changed` signals.
- **P4-02 and P4-03:** send, cancel, accept, and decline RPCs plus eligible
  classmate, group detail, and invitation detail read models
  (`20260911200509_phase4_group_invitation_operations.sql`), typed routes, the
  group detail invite panel (`group-detail.tsx`), and the invitation screen
  (`group-invitation.tsx`). Acceptance locks the invitee's class membership,
  the group, and the invitation before revalidating (GRP-008).
- **P4-04:** `mark_group_ready`, `transfer_group_leadership`, and
  `remove_group_member` (`20260911202704_phase4_group_leadership_operations.sql`)
  with the leader actions panel (`group-leader-actions.tsx`).
- **P4-06:** `supabase/tests/phase4_group_concurrency_test.sql` runs real
  concurrent sessions through `dblink` for the final-seat acceptance race, one
  student accepting two groups, and simultaneous leadership transfers; browser
  coverage is `tests/e2e/group-invitations.spec.ts`.
- Invitation-lifetime, formation-closed, and seat-counting choices are listed
  for owner confirmation in `docs/OWNER_QUESTIONS_PENDING.md`.

## Definition of done

All invariants hold under concurrent clients, every mutation is authorized and audited, and mobile screens explain rather than hide unavailable actions.
