# UI Contracts

## 1. Purpose

This file defines exact cross-feature presentation contracts that must not be invented during implementation: status tokens, notification types/copy/deep links, stable error behavior, and the additional screens required by D-059 and the admin module.

Thai is the primary label. English identifiers are stable code values and never shown alone to end users.

## 2. Status tokens

Color is supplemental. Every token includes a Thai label, icon, and shape. Implement colors as semantic design tokens with light/dark contrast checks rather than scattering literal hex values.

### Group

| Status | Thai label | Semantic color | Icon | Shape |
|---|---|---|---|---|
| `forming` | กำลังจัดกลุ่ม | amber | `UsersRound` | circle |
| `ready` | พร้อมส่งให้ครู | blue | `CircleCheckBig` | diamond |
| `approved` | ครูอนุมัติแล้ว | green | `BadgeCheck` | hexagon |
| `locked` | ล็อกกลุ่มแล้ว | slate | `LockKeyhole` | square |
| `archived` | เก็บถาวร | gray | `Archive` | rounded square |

### Session group

| Status | Thai label | Semantic color | Icon | Shape |
|---|---|---|---|---|
| `waiting` | กำลังรอ | gray | `Clock3` | circle |
| `ready` | กลุ่มถัดไป | blue | `ListStart` | diamond |
| `active` | กำลังสำรวจ | green | `Navigation` | pointed circle |
| `paused` | หยุดชั่วคราว | amber | `Pause` | square |
| `completed` | สำรวจเสร็จแล้ว | slate | `Flag` | hexagon |

### Observation

| Status | Thai label | Semantic color | Icon | Shape |
|---|---|---|---|---|
| `draft` | ฉบับร่าง | slate | `FilePenLine` | circle |
| `images_uploading` | กำลังอัปโหลดรูป | cyan | `UploadCloud` | striped circle |
| `analysis_queued` | รอ AI วิเคราะห์ | indigo | `ClockArrowUp` | diamond |
| `analysis_running` | AI กำลังวิเคราะห์ | violet | `Sparkles` | diamond |
| `student_review` | รอนักเรียนตรวจสอบ | sky | `ClipboardCheck` | hexagon |
| `submitted` | ส่งให้ครูแล้ว | amber | `Send` | circle |
| `teacher_review` | ครูกำลังตรวจ | orange | `Eye` | hexagon |
| `revision_required` | ครูขอให้แก้ไข | red | `RotateCcw` | triangle |
| `resubmitted` | ส่งแก้ไขแล้ว | blue | `RefreshCw` | diamond |
| `verified` | ครูยืนยันแล้ว | green | `BadgeCheck` | checked circle |
| `unable_to_verify` | ยังยืนยันไม่ได้ | purple | `CircleHelp` | square |
| `rejected` | ไม่รับรายการ | gray | `Ban` | octagon |

AI failure is an analysis substate, not an observation lifecycle status. Show `AI วิเคราะห์ไม่สำเร็จ` with `TriangleAlert`, retry, and manual-entry actions while the observation remains usable.

## 3. Notification layouts

Eight reusable layouts:

| Layout | Purpose | Required elements |
|---|---|---|
| `invitation` | invitation requiring decision | inviter, destination, expiry, primary/secondary action |
| `membership` | membership or leadership change | actor/reason when permitted, old/new group, acknowledgement |
| `group_status` | group lifecycle/readiness | group name, new status token, deep link |
| `session_status` | queue/session transition | activity, group/session status, time, deep link |
| `observation_status` | submission/review result | plant/observation label, status token, feedback preview |
| `request` | teacher/student action needed | requester, reason/category, pending action |
| `warning` | duplicate/location/operational warning | severity icon, concise cause, safe next action |
| `export` | queued artifact lifecycle | scope, state/expiry, authorized download action |

## 4. Notification type registry

Templates interpolate escaped relational display values. Free text is truncated in the row and shown only on the authorized detail screen.

| Type | Layout | Icon | Thai row copy | Deep link |
|---|---|---|---|---|
| `class_joined` | membership | `School` | `เข้าร่วมชั้นเรียน {className} แล้ว` | `/classes/{classId}` |
| `student_joined_class` | membership | `UserPlus` | `{studentName} เข้าร่วมชั้นเรียนแล้ว` | `/teacher/classes/{classId}/members` |
| `group_invitation_received` | invitation | `MailPlus` | `{leaderName} เชิญคุณเข้ากลุ่ม {groupName}` | `/group-invitations/{invitationId}` |
| `group_invitation_accepted` | membership | `UserRoundCheck` | `{studentName} ตอบรับเข้ากลุ่ม {groupName}` | `/classes/{classId}/groups/{groupId}` |
| `group_invitation_declined` | membership | `UserRoundX` | `{studentName} ปฏิเสธคำเชิญเข้ากลุ่ม` | `/classes/{classId}/groups/{groupId}` |
| `group_invitation_cancelled` | invitation | `MailX` | `คำเชิญเข้ากลุ่ม {groupName} ถูกยกเลิก` | `/classes/{classId}/groups` |
| `student_moved_group` | membership | `ArrowRightLeft` | `ครูย้ายคุณไปกลุ่ม {groupName}` | `/classes/{classId}/groups/{groupId}` |
| `leadership_assigned` | membership | `Crown` | `คุณได้รับมอบหมายเป็นหัวหน้ากลุ่ม {groupName}` | `/classes/{classId}/groups/{groupId}` |
| `leadership_transferred` | membership | `RefreshCw` | `หัวหน้ากลุ่ม {groupName} มีการเปลี่ยนแปลง` | `/classes/{classId}/groups/{groupId}` |
| `group_minimum_reached` | group_status | `UsersRound` | `กลุ่ม {groupName} มีสมาชิกครบขั้นต่ำแล้ว` | `/teacher/classes/{classId}/groups/{groupId}` |
| `group_approval_requested` | request | `ClipboardClock` | `กลุ่ม {groupName} ขอให้ครูตรวจและอนุมัติ` | `/teacher/classes/{classId}/groups/{groupId}` |
| `group_approved` | group_status | `BadgeCheck` | `ครูอนุมัติกลุ่ม {groupName} แล้ว` | `/classes/{classId}/groups/{groupId}` |
| `group_locked` | group_status | `LockKeyhole` | `กลุ่ม {groupName} ถูกล็อกแล้ว` | `/classes/{classId}/groups/{groupId}` |
| `group_unlocked` | group_status | `LockOpen` | `ครูปลดล็อกกลุ่ม {groupName} แล้ว` | `/classes/{classId}/groups/{groupId}` |
| `group_archived` | group_status | `Archive` | `กลุ่ม {groupName} ถูกเก็บถาวร` | `/classes/{classId}/groups` |
| `group_deleted` | group_status | `Trash2` | `กลุ่ม {groupName} ถูกลบ` | `/classes/{classId}/groups` |
| `session_group_next` | session_status | `ListStart` | `กลุ่มของคุณเป็นกลุ่มถัดไป เตรียมพร้อมสำรวจ` | `/activities/{activityId}/sessions/{sessionId}` |
| `session_group_active` | session_status | `Navigation` | `กลุ่มของคุณเริ่มสำรวจได้แล้ว` | `/field/sessions/{sessionId}` |
| `session_completed` | session_status | `Flag` | `กิจกรรม {activityName} เสร็จสิ้นแล้ว` | `/sessions/{sessionId}/map` |
| `observation_submitted` | observation_status | `Send` | `{studentName} ส่งรายการพืชใหม่` | `/teacher/reviews/{observationId}` |
| `observation_resubmitted` | observation_status | `RefreshCw` | `{studentName} ส่งรายการพืชที่แก้ไขแล้ว` | `/teacher/reviews/{observationId}` |
| `observation_revision_requested` | observation_status | `RotateCcw` | `ครูขอให้แก้ไขรายการพืชของคุณ` | `/observations/{observationId}/revision` |
| `revision_access_requested` | request | `MessageSquarePlus` | `{studentName} ขอแก้ไขข้อมูลเพิ่มเติม` | `/teacher/reviews/{observationId}/unlock-requests/{requestId}` |
| `revision_access_granted` | request | `LockOpen` | `ครูอนุญาตให้แก้ไขหัวข้อเพิ่มเติมแล้ว` | `/observations/{observationId}/revision` |
| `observation_verified` | observation_status | `BadgeCheck` | `ครูยืนยันรายการพืชของคุณแล้ว` | `/observations/{observationId}` |
| `observation_unable_to_verify` | observation_status | `CircleHelp` | `ครูยังยืนยันรายการพืชนี้ไม่ได้` | `/observations/{observationId}` |
| `observation_rejected` | observation_status | `Ban` | `ครูไม่รับรายการพืชนี้` | `/observations/{observationId}` |
| `same_species_warning` | warning | `Copy` | `พบการส่งพืชชนิดเดียวกันซ้ำในกิจกรรม` | `/teacher/reviews/{observationId}` |
| `observation_issue_reported` | request | `FlagTriangleRight` | `มีนักเรียนรายงานปัญหาในรายการพืช` | `/teacher/reports/{reportId}` |
| `location_session_warning` | warning | `MapPinWarning` | `พบปัญหาตำแหน่งหรือสถานะระหว่างกิจกรรม` | `/teacher/sessions/{sessionId}/live` |
| `export_ready` | export | `Download` | `ไฟล์ส่งออก {exportName} พร้อมดาวน์โหลดแล้ว` | `/teacher/exports/{exportId}` |

Notification producers choose the type; clients never render arbitrary server-supplied HTML. Deep-link destinations reauthorize on open.

## 5. Stable error behavior

All errors show an accessible title, explanation, and safe action. Developer details and request ID live in an expandable support area, not the primary student message.

### Authentication/admin errors

| Code | Thai title | Primary action |
|---|---|---|
| `AUTH_REQUIRED` | กรุณาเข้าสู่ระบบ | ไปหน้าเข้าสู่ระบบ |
| `EMAIL_REQUIRED` | ต้องใช้อีเมล | กลับไปกรอกอีเมล |
| `EMAIL_NOT_CONFIRMED` | กรุณายืนยันอีเมล | ส่งอีเมลยืนยันอีกครั้ง |
| `INVALID_CREDENTIALS` | อีเมลหรือรหัสผ่านไม่ถูกต้อง | ลองใหม่ / ลืมรหัสผ่าน |
| `PASSWORD_POLICY_FAILED` | รหัสผ่านยังไม่ปลอดภัยพอ | แก้ไขรหัสผ่าน |
| `AUTH_CALLBACK_INVALID` | ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ | ขออีเมลใหม่ |
| `RECOVERY_LINK_INVALID` | ลิงก์เปลี่ยนรหัสผ่านหมดอายุ | ขอเปลี่ยนรหัสผ่านใหม่ |
| `ACCOUNT_DISABLED` | บัญชีนี้ใช้งานไม่ได้ | ติดต่อผู้ดูแลระบบ |
| `TEACHER_INVITE_REQUIRED` | บัญชียังไม่ได้รับสิทธิ์ครู | ติดต่อผู้ดูแลระบบ |
| `TEACHER_INVITE_INVALID` | คำเชิญครูไม่ถูกต้อง | ติดต่อผู้ดูแลระบบ |
| `TEACHER_INVITE_EXPIRED` | คำเชิญครูหมดอายุ | ขอคำเชิญใหม่ |
| `ADMIN_REQUIRED` | ไม่มีสิทธิ์ผู้ดูแลระบบ | กลับหน้าหลัก |
| `MFA_REQUIRED` | ต้องยืนยันตัวตนสองขั้นตอน | ตั้งค่า/ยืนยัน MFA |
| `TELEMETRY_SOURCE_UNAVAILABLE` | ข้อมูลระบบบางส่วนยังไม่พร้อม | ดูเวลาความสดและลองใหม่ |
| `BREAK_GLASS_REQUIRED` | ต้องขอสิทธิ์ฉุกเฉินสำหรับข้อมูลนี้ | ระบุเหตุผลและขอบเขตคำขอ |
| `BREAK_GLASS_EXPIRED` | สิทธิ์ฉุกเฉินหมดอายุแล้ว | ขอสิทธิ์ใหม่เมื่อยังจำเป็น |
| `INVALID_CURSOR` | รายการเปลี่ยนแปลงหรือหน้าข้อมูลไม่ถูกต้อง | โหลดรายการใหม่ตั้งแต่ต้น |
| `TIME_RANGE_TOO_LARGE` | ช่วงเวลาที่ค้นหากว้างเกินไป | เลือกช่วงเวลาไม่เกิน 31 วัน |
| `IDEMPOTENCY_KEY_REQUIRED` | ยังยืนยันการทำรายการซ้ำอย่างปลอดภัยไม่ได้ | โหลดข้อมูลใหม่แล้วลองอีกครั้ง |
| `IDEMPOTENCY_KEY_REUSE` | คำขอนี้ไม่ตรงกับรายการเดิม | เริ่มรายการใหม่ |

### Class/group errors

| Code | Thai title | Primary action |
|---|---|---|
| `FORBIDDEN` | คุณไม่มีสิทธิ์ทำรายการนี้ | กลับหน้าก่อนหน้า |
| `CLASS_NOT_ACTIVE` | ชั้นเรียนนี้ปิดใช้งานแล้ว | กลับรายการชั้นเรียน / ติดต่อครู |
| `INVITE_INVALID` | รหัสเชิญไม่ถูกต้อง | ตรวจสอบรหัส |
| `INVITE_EXPIRED` | รหัสเชิญหมดอายุ | ขอรหัสใหม่จากครู |
| `INVITE_DISABLED` | รหัสเชิญถูกปิดแล้ว | ขอรหัสใหม่จากครู |
| `GROUP_FORMATION_CLOSED` | ปิดการจัดกลุ่มแล้ว | ดูกลุ่มปัจจุบัน |
| `STUDENT_GROUP_CREATION_DISABLED` | ครูไม่อนุญาตให้นักเรียนสร้างกลุ่ม | เข้าร่วมกลุ่มที่มีอยู่ |
| `GROUP_LIMIT_REACHED` | กลุ่มครบจำนวนแล้ว | เข้าร่วมหรือรอคำเชิญ |
| `STUDENT_ALREADY_IN_GROUP` | คุณอยู่ในกลุ่มแล้ว | เปิดกลุ่มของฉัน |
| `STUDENT_GROUP_ALREADY_CREATED` | คุณใช้สิทธิ์สร้างกลุ่มแล้ว | เปิดกลุ่ม / ติดต่อครู |
| `GROUP_FULL` | กลุ่มนี้เต็มแล้ว | เลือกกลุ่มอื่น |
| `GROUP_LOCKED` | กลุ่มถูกล็อกแล้ว | กลับหน้ากลุ่ม |
| `NOT_GROUP_LEADER` | เฉพาะหัวหน้ากลุ่มทำรายการนี้ได้ | กลับหน้ากลุ่ม |
| `LEADER_SUCCESSOR_REQUIRED` | ต้องเลือกหัวหน้าคนใหม่ก่อน | เลือกผู้สืบทอด |
| `GROUP_HAS_SESSION_HISTORY` | กลุ่มนี้มีประวัติกิจกรรม | เก็บถาวรแทนการลบ |
| `GROUP_IN_ACTIVE_SESSION` | เปลี่ยนกลุ่มไม่ได้ระหว่างกิจกรรม | รอให้กิจกรรมจบ |
| `INVITATION_NOT_PENDING` | คำเชิญนี้ดำเนินการแล้ว | รีเฟรชข้อมูล |
| `INVITATION_EXPIRED` | คำเชิญเข้ากลุ่มหมดอายุ | กลับหน้ากลุ่ม |
| `DESTINATION_GROUP_INVALID` | ย้ายไปกลุ่มนี้ไม่ได้ | เลือกกลุ่มใหม่ |

### Field/observation errors

| Code | Thai title | Primary action |
|---|---|---|
| `SESSION_NOT_OPEN` | กิจกรรมยังไม่เปิด | กลับหน้ารอ |
| `GROUP_NOT_ACTIVE` | ยังไม่ถึงรอบกลุ่มของคุณ | กลับหน้ารอ |
| `ACTIVE_GROUP_CONFLICT` | มีกลุ่มอื่นเริ่มสำรวจก่อนแล้ว | รีเฟรชสถานะ |
| `OBSERVATION_VERSION_CONFLICT` | ข้อมูลมีการเปลี่ยนแปลงแล้ว | ดูข้อมูลล่าสุดและทำซ้ำ |
| `IMAGE_LIMIT_EXCEEDED` | เพิ่มรูปได้สูงสุด 10 รูป | ลบรูปก่อนเพิ่ม |
| `IMAGE_TOO_LARGE` | รูปยังมีขนาดใหญ่เกินไป | ประมวลผล/เลือกรูปใหม่ |
| `INVALID_IMAGE_TYPE` | ไม่รองรับไฟล์รูปนี้ | เลือกรูปใหม่ |
| `LOCATION_UNAVAILABLE` | ยังหาตำแหน่งไม่ได้ | รอ/ลองใหม่/บันทึกแบบมีธง |
| `ANALYSIS_ALREADY_QUEUED` | ส่งให้ AI วิเคราะห์แล้ว | ดูสถานะการวิเคราะห์ |
| `AI_ANALYSIS_FAILED` | AI วิเคราะห์ไม่สำเร็จ | ลองใหม่ / กรอกเอง |
| `STUDENT_REVIEW_REQUIRED` | กรุณาตรวจผลกับต้นจริง | กลับไปตรวจลักษณะ |
| `PLANT_NAME_REQUIRED` | ต้องกรอกชื่อไทยหรือชื่อทั่วไป | กรอกชื่อพืช |
| `SCIENTIFIC_NAME_REQUIRED` | ต้องกรอกชื่อวิทยาศาสตร์ | กรอกชื่อวิทยาศาสตร์ |
| `SAME_SPECIES_ACKNOWLEDGEMENT_REQUIRED` | กรุณารับทราบว่าพบชนิดเดียวกัน | เปิดคำเตือนและรับทราบ |
| `INVALID_STATUS_TRANSITION` | สถานะเปลี่ยนไปแล้ว | รีเฟรชข้อมูล |
| `FIELD_NOT_UNLOCKED_FOR_REVISION` | ครูยังไม่เปิดหัวข้อนี้ให้แก้ | ส่งคำขอแก้เพิ่ม |
| `SESSION_PAUSED` | กิจกรรมหยุดชั่วคราว | บันทึกร่างและรอครู |
| `RATE_LIMITED` | ทำรายการบ่อยเกินไป | รอตามเวลาที่แสดงแล้วลองใหม่ |

`RATE_LIMITED` disables repeat action until `Retry-After` expires. `CLASS_NOT_ACTIVE` preserves no mutation retry and routes to the class list. This completes D-060.

## 6. Required additional screen contracts

### Manual plant entry

- Entry points: AI waiting, insufficient evidence, AI failure, or explicit `กรอกข้อมูลเอง`.
- Fields: Thai/common name, scientific name, trait rows, optional source/reference note, required evidence note.
- Preserve uploaded images, capture metadata, and any provisional AI result separately.
- Show autosave/local sync state, validation, same-species warning, review-before-submit, and offline recovery.
- Returning to AI results never overwrites manual values without confirmation.

### Teacher group unlock and creation-claim reset

- Group detail shows lock reason/history and active-session restriction.
- Unlock requires confirmation and displays affected capabilities/notifications.
- Claim reset is a separate action selecting the student, prior claimed group, reason, and confirmation.
- It is unavailable unless the prior group is explicitly resolved and no active session blocks the action.
- Success shows audit reference and sends the documented notification/invalidation.

### Student cross-class observation list

- Role route: `My observations` across authorized classes.
- Cursor-paginated cards sorted by latest activity then ID.
- Filters: class, status, activity, and date range; no unbounded free-form export.
- Card: primary image derivative, common/scientific name, class/activity, status token, last update, sync state.
- States: no classes, no observations, local-only draft, offline cache, stale refresh, permission removed, and load more.

### Class member lists

- Student view: classmates in the same active class with display name and permitted group assignment; no emails unless explicitly approved later.
- Teacher view: students/teachers, join date, current group, invitation/membership state, and relevant actions already allowed by product rules.
- No suspend action. Class role is only teacher/student.
- Search/filter stays within the authorized class and uses cursor pagination where the hard class limit could still produce long lists.

## 7. Admin screen contracts

- `System health`: flow SLO cards, error rate/latency, queue age/dead letters, provider status, freshness indicator.
- `Users`: teacher/student directory with school/class summary; email visible only to authorized admin; cursor pagination.
- `Schools and teacher provisioning`: school list, create/archive, teacher invitation issue/revoke/status.
- `Flow errors`: filter by flow/stage/code/release/environment/time and open correlated redacted event detail.
- `Audit explorer`: actor/resource/action/outcome/time filters and immutable detail.
- `Incidents`: acknowledge, append notes, link runbook, close with resolution; never edit source events.
- `Break-glass`: reason, resource scope, expiry, MFA reauthentication, approval where configured, visible active-access banner.

Admin screens never include a general “view as user” or unrestricted student-content browser.

## 8. Implementation checks

- Notification registry is represented as typed constants validated against database allowed types.
- Every stable error code has exactly one mapping and an automated coverage test.
- Status token tables produce visible text/icon/shape in list, marker, detail, and filter contexts.
- Deep links reauthorize and have missing/deleted/action-expired states.
- Thai copy supports variable expansion and wrapping at 360 px.
