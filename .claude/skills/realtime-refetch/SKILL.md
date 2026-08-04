---
name: realtime-refetch
description: Supabase Realtime and server-state synchronization for AI Escort — private channel naming, Broadcast vs Presence, the signal-then-refetch pattern, reconnect and foreground recovery, and in-app notification delivery. Use when subscribing to a channel, wiring TanStack Query invalidation, handling stale or conflicting data after reconnect, designing a live map or group board update, or when tempted to poll on a timer.
---

# Realtime and refetch

Source: `docs/SYSTEM_ARCHITECTURE.md` §7/§8, `docs/API_AND_REALTIME.md` §12/§19, D-006, D-032, D-041.

## The pattern — memorize this

```text
initial authoritative database fetch
→ subscribe to private channel
→ signal arrives (payload is a pointer, not data)
→ invalidate + refetch the authoritative query
```

Also refetch on: **browser foreground**, **network reconnect**, **Realtime reconnect**, and **after any mutation resolves**.

## Anti-patterns

- ❌ Five-second polling as the primary mechanism (D-041 explicitly rejects it). An optional 30–60 s fallback poll while a group screen is open is allowed.
- ❌ Trusting the event payload as data. Payloads carry IDs and timestamps so the client knows *what* to refetch.
- ❌ Treating channel subscription as authorization — the underlying read still passes RLS.
- ❌ Optimistic updates on server-arbitrated actions. Group creation and observation submission must wait for the server verdict. Optimistic is fine for camera shutter and trait match/not-match taps.

## Channels

```text
class:{classId}:groups
user:{userId}:notifications
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
session:{sessionId}:observations
user:{userId}:observation-jobs
```

All private.

## Broadcast vs Presence

- **Presence** — low-frequency participant state: connected, waiting/ready/exploring/paused, last heartbeat, current session/group. Session group statuses are `waiting → ready → active → paused → completed`; a teacher may pause/resume a session and complete one group without ending the session (D-056).
- **Broadcast** — ephemeral events and change signals: live location, heading/speed/accuracy, checkpoint progress, teacher alerts, session/group state changes, group-board invalidation, `notification.created`, `observation.marker_changed`.

Durable rows remain the source of truth for groups, memberships, invitations, notifications, submitted markers, observation status, AI state, revisions, verification, and completed-session state.

## Group events

```text
group.created  group.updated  group.deleted  group.archived
group.locked   group.unlocked group.member_joined group.member_left
group.member_moved group.leader_changed
group.invitation_changed group.capacity_changed group.formation_changed
```

## Notifications

Durable PostgreSQL rows are the truth; Realtime is only the immediate nudge.

```text
mutation succeeds
→ INSERT notification row
→ emit notification.created on user:{userId}:notifications
→ client invalidates unread count + list
```

A notification must still be there after an app restart. Email is out of scope for the MVP (D-031, D-032).

## Live location

Broadcast roughly every 2–5 s while moving; durable sampling every 10–30 s or on a meaningful event. Position older than 30 s renders as stale (dashed marker + "อัปเดต N นาทีที่แล้ว"). Broadcast stops the moment the session ends.

## UI recovery rules

- Incoming event on a list → thin "มีการอัปเดต" bar, user taps to refresh.
- **Exception:** the group-formation board refreshes itself immediately — a stale slot count causes a failed create.
- After reconnect, show what changed rather than silently swapping content under the user's finger.
- Offline banner is persistent until connectivity returns; queued work is visible and countable.
