---
name: offline-and-images
description: Offline-first field behavior and the image pipeline for AI Escort — IndexedDB drafts, client-generated UUIDs, idempotent sync and retry queues, GPS handling under weak signal, client-side orientation/resize/compression, private Storage upload, and presentation derivatives. Use when handling camera capture, uploads, retries, connectivity loss, draft persistence, geolocation, or any code that runs on a student's phone in the field.
---

# Offline behavior and image pipeline

Source: `docs/SYSTEM_ARCHITECTURE.md` §10/§15, `docs/PRODUCT_REQUIREMENTS.md` §16/§17, `docs/API_AND_REALTIME.md` §13/§14, D-020, D-021.

## Field assumptions

Students are outdoors, in bright light, standing or walking, one-handed, on low-to-mid-range Android, with intermittent signal. Nothing may be lost by a dropped connection, a backgrounded tab, or a page refresh.

## IndexedDB holds

- the draft observation;
- its client-generated UUID;
- media pending upload;
- upload and analysis retry state;
- unsent research events;
- temporary location data as permitted.

Sync is **idempotent**. A failed sync never discards a draft. Field forms autosave; the "บันทึกในเครื่องแล้ว" state must be visible, and the pending-sync count must be tappable to open the queue.

## What is NOT allowed offline

Group creation and invitation acceptance need live server validation. Cached group UI may render, but it can never reserve a slot or confirm membership offline. Show the cached state as stale, not as truth.

## GPS

- Capture location, accuracy (m), and time at the **start** of the observation.
- Weak signal → show the accuracy number in metres and offer to wait. Never hide the number behind a signal-bar graphic.
- No fix after retry → explicitly flagged record for teacher handling. **Never fabricate a coordinate** (D-020).
- Error code: `LOCATION_UNAVAILABLE`.

## Client preprocessing, in order

1. read image, correct EXIF orientation;
2. retain the original capture time **separately** from image metadata;
3. resize only when longest edge exceeds 2,048 px;
4. compress toward quality 82–85;
5. enforce a 5 MB maximum per processed image;
6. generate an image hash where practical;
7. upload to a private bucket with a deterministic path and idempotency key.

Accepted input: `image/jpeg`, `image/png`, `image/webp`. Position 1–10. Errors: `IMAGE_LIMIT_EXCEEDED`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE_TYPE`.

Watch canvas memory ceilings on low-end Android — process one image at a time, release object URLs.

## Presentation derivatives

| Size | Use |
|---|---|
| 256 px | map marker preview |
| 512 px | list / card |
| 1,200 px | teacher review |
| 2,048 px | AI and full review source |

The uploaded processed source stays private.

## Retry and failure UI

- Per-image progress, cancellable.
- A failed image gets a red border and its own retry affordance — the draft is never discarded.
- Failed submission queues and reports its position in the queue.
- Retry is automatic with visible status; manual "ลองใหม่ทั้งหมด" is also available.
- Errors state **cause + way out**, in plain Thai: "ส่งไม่สำเร็จ เพราะสัญญาณขาด — ระบบจะลองใหม่ให้อัตโนมัติ".
