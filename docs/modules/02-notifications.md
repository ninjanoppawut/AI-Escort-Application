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

## Definition of done

All required notification types are persisted, private, accessible, deep-linkable, and verified under reconnect and stale-data conditions.
