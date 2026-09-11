# NOT — Durable In-App Notifications

## Outcome

Users receive durable, private, actionable in-app notifications that survive reloads and update promptly through Realtime change signals.

## Canonical references

- `docs/PRODUCT_REQUIREMENTS.md` §8
- `docs/DECISIONS_AND_QUESTIONS.md` D-032, D-046, D-057, D-058
- `docs/API_AND_REALTIME.md` §§11–12
- `docs/DATABASE_DESIGN.md` §6
- `docs/UI_CONTRACTS.md` §§3–4

## Scope

In scope: notification rows, unread count, list/detail, mark one/all read, deep links, private signal channel, event producers, and accessible notification layouts.

Out of scope: email, SMS, push-notification infrastructure, and storing notifications only in transient Realtime messages.

## Functional requirements

- **NOT-001:** Every notification is a durable row owned by exactly one recipient.
- **NOT-002:** A recipient can list, open, mark one read, and mark all read; other users cannot read or mutate those rows.
- **NOT-003:** The UI performs an initial authoritative fetch and refetches after a private `user:{userId}:notifications` signal.
- **NOT-004:** The client refetches on foreground, network reconnect, Realtime reconnect, and notification mutations.
- **NOT-005:** Each type defined by the product requirements maps to an approved layout, Thai copy key, accessible icon/label, and authorized deep-link target.
- **NOT-006:** Review feedback always targets the observation owner; group events target only affected users.
- **NOT-007:** Large export completion produces an in-app notification with an authorized download link.

## Authorization and data boundary

- RLS limits select/update to `recipient_user_id = auth.uid()`.
- Realtime channels are private and authorized independently of the initial fetch.
- Context payloads may use versioned `jsonb`, but recipient, type, read state, creation time, and related resource IDs remain relational.
- Deep links reauthorize the destination; possession of a notification does not grant access.

## Required states and failures

Unread/read, empty, loading, stale-refreshing, offline, reconnecting, deleted destination, action no longer available, and permission-denied states are required.

## Verification

- Cross-user RLS isolation and mark-read authorization tests.
- Reload persistence test.
- Realtime signal followed by authoritative refetch test.
- Deep-link tests for all notification type families.

## Dependencies

AUTH identity and authorization; event producers in GRP, MGT, SES, REV, and MAP.

## Implementation status

- **P2-01 complete:** `public.notification_types`, upgraded
  `public.notifications`, private target-population trigger, and hardened
  `private.insert_notification` live in
  `supabase/migrations/20260812021256_phase2_notification_foundation.sql`.
- Typed client/server registry constants live in
  `src/features/notifications/contracts.ts`; generated database types are in
  `src/lib/supabase/database.types.ts`.
- Verification lives in
  `supabase/tests/phase2_notification_foundation_test.sql` and
  `src/features/notifications/contracts.test.ts`.
- **P2-02 complete:** list/unread count, mark-one-read, mark-all-read, cursor
  pagination, and registry-based deep-link generation live in
  `src/app/api/notifications/*`,
  `src/features/notifications/server/operations.ts`, and
  `src/features/notifications/deep-link.ts`.
- **P2-03 complete:** private notification Broadcast authorization, durable-row
  insert signal emission, and authoritative client query invalidation live in
  `supabase/migrations/20260812041306_phase2_notification_realtime.sql`,
  `src/features/notifications/client/realtime.tsx`, and
  `src/app/app-providers.tsx`.
- **P2-04 complete:** notification center layouts, unread badge, read filters,
  mark-read controls, empty/loading/offline/stale/deleted-target states, and
  pagination live in `src/app/notifications/page.tsx`,
  `src/features/notifications/client/notification-center.tsx`,
  `src/features/notifications/client/notification-badge.tsx`, and `/app`.
- **P2-05 complete:** browser coverage for durable persistence across reload,
  recipient isolation, cross-user mutation denial, private Broadcast
  signal/refetch, deleted-target presentation, and destination reauthorization
  lives in `tests/e2e/notifications.spec.ts`. The Realtime signal parser accepts
  Supabase database Broadcast metadata and offset timestamps in
  `src/features/notifications/contracts.ts`.
- **P2-EXIT complete:** restart persistence and recipient-scoped read/mutation
  authorization are verified by the focused `P2-EXIT` browser journey in
  `tests/e2e/notifications.spec.ts`.
- Later feature routes still own destination-specific producer coverage as
  those modules ship.

## Definition of done

All required notification types are persisted, private, accessible, deep-linkable, and verified under reconnect and stale-data conditions.
