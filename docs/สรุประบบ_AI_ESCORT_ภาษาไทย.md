# สรุประบบ AI Escort Application ฉบับภาษาไทย

## 1. เป้าหมายของระบบ

AI Escort Application เป็นแอปพลิเคชันสำหรับจัดกิจกรรมสำรวจพืชในพื้นที่ที่ครูกำหนด โดยใช้ AI เป็นผู้ช่วยนำทางการเรียนรู้ นักเรียนเดินสำรวจในขอบเขตพื้นที่จริง ถ่ายภาพพืช ส่งภาพให้ Gemini วิเคราะห์ชื่อและลักษณะพืช จากนั้นนักเรียนตรวจสอบข้อมูลกับต้นพืชจริงก่อนส่งให้ครูตรวจ

AI มีหน้าที่เสนอข้อมูลเบื้องต้น ชี้จุดที่ต้องสังเกตเพิ่มเติม และช่วยตรวจความครบถ้วน แต่ AI ไม่ใช่ผู้ยืนยันชื่อพืชขั้นสุดท้าย นักเรียนต้องตรวจสอบกับของจริง และครูเป็นผู้ตรวจสอบขั้นสุดท้าย

---

## 2. กลุ่มผู้ใช้งานและสิทธิ์

### นักเรียน

- เข้าร่วมชั้นเรียนด้วยรหัสหรือ Link
- สร้างหรือเข้าร่วมกลุ่มในชั้นเรียน
- เข้าร่วมกิจกรรมสำรวจ
- ดูเส้นทางและขอบเขตพื้นที่
- แชร์ตำแหน่งระหว่างการสำรวจ
- ถ่ายภาพพืชและส่งให้ Gemini วิเคราะห์
- ตรวจสอบข้อมูล AI กับพืชจริง
- แก้ไขข้อมูลที่ไม่ตรง
- ส่งรายการสำรวจให้ครูตรวจ
- ดูผลการตรวจและแก้ไขตามคำแนะนำ

### ครู

- สร้างและจัดการชั้นเรียน
- เชิญนักเรียนเข้าชั้นเรียน
- สร้างกิจกรรมสำรวจ กำหนดเส้นทาง ขอบเขต และจุดตรวจ
- จัดกลุ่มและกำหนดลำดับกลุ่ม
- เปิด ปิด พัก และจบ Session
- กำหนดกลุ่มที่กำลังสำรวจ
- ดูตำแหน่งและความคืบหน้าแบบ Realtime
- ตรวจรายการสำรวจของนักเรียน
- ยืนยัน ส่งกลับแก้ไข ระบุว่ายืนยันไม่ได้ หรือปฏิเสธรายการ
- Export ข้อมูลสำหรับการเรียนหรือการวิจัย

### ผู้ดูแลระบบ

- จัดการผู้ใช้ โรงเรียน และสิทธิ์ระดับระบบ
- จัดการ AI Provider และข้อจำกัดการใช้งาน
- ดู Audit Log และการใช้งานระบบ
- จัดการข้อมูลอ้างอิงของพืช

---

## 3. โครงสร้างข้อมูลหลัก

```text
โรงเรียน
 └─ ชั้นเรียน
     ├─ ครู
     ├─ นักเรียน
     ├─ กลุ่ม
     └─ กิจกรรม
         ├─ เส้นทาง
         ├─ ขอบเขตพื้นที่
         ├─ จุดตรวจ
         └─ Session การสำรวจ
             ├─ กลุ่มที่รอ
             ├─ กลุ่มที่กำลังสำรวจ
             ├─ ตำแหน่งสมาชิก
             ├─ รายการสำรวจพืช
             └─ ผลการตรวจของครู
```

Activity คือแผนกิจกรรมที่นำกลับมาใช้ได้หลายครั้ง ส่วน Session คือการดำเนินกิจกรรมนั้นจริงในวันและเวลาหนึ่ง

---

## 4. กฎกลุ่มที่กำลังสำรวจ

ใน Session เดียวกัน มีได้เพียงหนึ่งกลุ่มที่อยู่ในสถานะ `active` ในเวลาเดียวกัน

ตัวอย่าง:

```text
กลุ่ม A: completed
กลุ่ม B: active
กลุ่ม C: waiting
```

ระบบต้องบังคับกฎนี้ที่ระดับ PostgreSQL ไม่ใช่เฉพาะหน้าเว็บ

```sql
create unique index one_active_group_per_session
on exploration_session_groups(session_id)
where status = 'active';
```

กลุ่มที่ยังรอสามารถดูข้อมูลกิจกรรมและเส้นทางล่วงหน้าได้ แต่ยังไม่สามารถส่งตำแหน่งสดหรือส่งรายการสำรวจจนกว่าจะถูกเปิดเป็นกลุ่ม active

---

## 5. Flow หลักของการสำรวจพืช

```text
นักเรียนเข้าสู่ Session
→ ระบบตรวจสิทธิ์และสถานะกลุ่ม
→ แสดงแผนที่ เส้นทาง และขอบเขตพื้นที่
→ นักเรียนเดินสำรวจในพื้นที่ที่กำหนด
→ พบต้นไม้และกดเพิ่มรายการสำรวจ
→ ระบบบันทึกตำแหน่ง เวลา และ GPS accuracy
→ นักเรียนถ่ายภาพพืช
→ ส่งภาพให้ Gemini วิเคราะห์
→ Gemini ส่งชื่อพืชที่เป็นไปได้และลักษณะพืชกลับมา
→ นักเรียนตรวจสอบข้อมูลกับต้นพืชจริง
→ นักเรียนยืนยันหรือแก้ไขข้อมูล
→ ระบบตรวจรายการซ้ำ
→ นักเรียน Submit
→ ครูตรวจสอบ
→ ครูยืนยัน ส่งกลับแก้ไข ระบุว่ายืนยันไม่ได้ หรือปฏิเสธ
```

---

## 6. การถ่ายภาพและข้อมูลที่บันทึก

เมื่อนักเรียนเริ่มสร้าง Observation ระบบต้องบันทึก:

- ผู้ถ่าย
- Activity
- Session
- กลุ่ม
- พิกัดขณะถ่าย
- GPS accuracy
- เวลาถ่าย
- ภาพต้นฉบับ

ภาพที่รองรับ:

- ภาพทั้งต้น
- ภาพใบ
- ภาพลำต้น
- ภาพดอก
- ภาพผล
- ภาพบริเวณโดยรอบ

ใน MVP อนุญาตให้เริ่มจากภาพหลักอย่างน้อยหนึ่งภาพ และให้ Gemini ขอภาพเพิ่มเติมได้เมื่อหลักฐานไม่เพียงพอ

ตำแหน่งหลักของพืชต้องใช้ตำแหน่งตอนถ่ายภาพ ไม่ใช่ตำแหน่งตอนกด Submit เพราะนักเรียนอาจเดินออกจากต้นพืชแล้ว

ระบบควรเก็บแยก:

```text
capture_location
capture_accuracy_m
captured_at
submission_location
submission_accuracy_m
submitted_at
```

---

## 7. ข้อมูลที่ Gemini ต้องส่งกลับ

Gemini ต้องส่งข้อมูลแบบ Structured JSON ไม่ใช่ข้อความยาวอย่างเดียว

ตัวอย่าง:

```json
{
  "identificationStatus": "possible_match",
  "suggestions": [
    {
      "commonNameTh": "มะม่วง",
      "commonNameEn": "Mango",
      "scientificName": "Mangifera indica",
      "confidence": 0.87,
      "evidenceSummary": "ลักษณะใบและทรงพุ่มสอดคล้องบางส่วน"
    }
  ],
  "observedCharacteristics": {
    "plantType": "ไม้ต้น",
    "leafType": "ใบเดี่ยว",
    "leafArrangement": "เรียงสลับ",
    "leafShape": "รูปรีถึงรูปหอก",
    "leafMargin": "ขอบเรียบ",
    "stemCharacteristics": "ลำต้นเป็นเนื้อไม้ เปลือกสีน้ำตาล",
    "flowerCharacteristics": null,
    "fruitCharacteristics": null
  },
  "missingEvidence": [
    "ควรถ่ายภาพด้านใต้ใบเพิ่มเติม",
    "ยังไม่เห็นดอกหรือผล"
  ],
  "disclaimer": "ผลลัพธ์เป็นข้อเสนอเบื้องต้น ต้องตรวจสอบกับพืชจริง"
}
```

ข้อมูลหลักที่ต้องรองรับ:

- ชื่อพืชภาษาไทย
- ชื่อสามัญภาษาอังกฤษ
- ชื่อวิทยาศาสตร์
- ตัวเลือกชนิดพืชมากกว่าหนึ่งรายการ
- ระดับความมั่นใจ
- เหตุผลสั้น ๆ
- ประเภทพืช
- ลักษณะใบ
- การเรียงตัวของใบ
- รูปร่างใบ
- ขอบใบ
- เส้นใบ
- ลักษณะลำต้น
- ลักษณะดอก
- ลักษณะผล
- ลักษณะเด่นอื่น ๆ
- หลักฐานที่ยังขาด

เมื่อไม่เห็นข้อมูลจากภาพ Gemini ต้องส่ง `null` หรือระบุว่าไม่สามารถสังเกตได้ ห้ามเดาข้อมูลขึ้นมา

---

## 8. การตรวจสอบโดยนักเรียน

หลัง Gemini วิเคราะห์ ระบบต้องแสดงหน้าให้นักเรียนตรวจสอบกับต้นพืชจริงก่อน Submit

แต่ละลักษณะให้นักเรียนเลือก:

```text
ตรง
ไม่ตรง
ไม่แน่ใจ
มองไม่เห็น
```

ตัวอย่าง:

```text
AI ระบุ: ใบเดี่ยว
นักเรียน: ตรง

AI ระบุ: ใบเรียงสลับ
นักเรียน: ไม่ตรง
นักเรียนแก้เป็น: ใบเรียงตรงข้าม
```

ระบบต้องเก็บข้อมูลแยกกันระหว่าง:

- ค่าที่ Gemini วิเคราะห์
- ผลการตรวจของนักเรียน
- ค่าที่นักเรียนแก้ไข
- หมายเหตุหรือเหตุผลของนักเรียน
- ผลการตรวจของครู

ห้ามเขียนทับข้อมูลเดิม เพราะต้องใช้ตรวจสอบกระบวนการเรียนรู้ย้อนหลังได้

สถานะการตรวจของนักเรียน:

```text
match
not_match
unsure
not_visible
```

---

## 9. การตรวจรายการซ้ำ

ระบบต้องแยกการตรวจซ้ำเป็นสองระดับ

### 9.1 ชนิดพืชซ้ำ

ตรวจว่าภายใน Activity หรือ Session เดียวกัน เคยมีการบันทึกพืชชนิดเดียวกันแล้วหรือไม่

ใช้ข้อมูลประกอบ:

- Taxon ID
- ชื่อวิทยาศาสตร์
- ชื่อพืชภาษาไทย
- ชื่อพ้อง
- ลักษณะใบ ดอก ผล และลำต้น
- คะแนนความมั่นใจของ AI
- รายการที่ครูยืนยันแล้ว

ตัวอย่างข้อความ:

```text
พบพืชชนิดนี้ในกิจกรรมแล้ว 3 รายการ

[ดูรายการเดิม]
[บันทึกต้นใหม่ชนิดเดียวกัน]
[เพิ่มข้อมูลให้รายการเดิม]
[AI ระบุชนิดไม่ถูกต้อง]
```

พืชชนิดเดียวกันแต่เป็นคนละต้นต้องยังบันทึกได้

### 9.2 ต้นเดิมหรือตัวอย่างเดิมซ้ำ

ตรวจว่า Observation ใหม่อาจเป็นต้นเดียวกับ Observation เดิมหรือไม่

ต้องใช้ข้อมูลหลายอย่างร่วมกัน:

- ชนิดพืชตรงกันหรือใกล้เคียงกัน
- ลักษณะพืชตรงกัน
- ความคล้ายของภาพ
- ตำแหน่ง
- เวลา
- ลักษณะเด่นเฉพาะของลำต้น ใบ ดอก หรือผล

ระบบห้ามใช้ระยะห่างเพียงอย่างเดียว

ตัวอย่าง:

```text
รายการนี้อาจเป็นต้นเดียวกับที่เคยบันทึกไว้

ชนิดพืช: มะม่วง
ลักษณะพืช: ใกล้เคียงกัน
ความคล้ายของภาพ: สูง
ระยะห่าง: 2.4 เมตร

[เป็นต้นเดียวกัน]
[เป็นคนละต้น]
[ไม่แน่ใจ]
```

ผลตรวจซ้ำต้องเป็นคำแนะนำ ไม่ใช่คำตัดสินอัตโนมัติ ระบบห้ามรวม ลบ หรือปฏิเสธ Observation เอง

สถานะที่รองรับ:

```text
not_checked
no_match
same_species
possible_same_specimen
confirmed_same_specimen
confirmed_different_specimen
```

หากยืนยันว่า Observation หลายรายการเป็นต้นเดียวกัน ให้เชื่อมด้วย `specimen_id` เดียวกัน โดยยังเก็บ Observation แต่ละรายการไว้

---

## 10. การตรวจขอบเขตพื้นที่

ระบบตรวจตำแหน่งตอนถ่ายภาพ:

```text
อยู่ในพื้นที่ → บันทึกตามปกติ
ใกล้ขอบเขต → แจ้งเตือนแต่อนุญาต
อยู่นอกพื้นที่ → แจ้งเตือนและให้ยืนยันหรือระบุเหตุผล
```

ไม่ควรบล็อกจาก GPS เพียงตัวอย่างเดียว เพราะ GPS อาจคลาดเคลื่อน

ควรพิจารณา:

- GPS accuracy
- ระยะที่อยู่นอกขอบเขต
- ระยะเวลาที่อยู่นอกขอบเขตต่อเนื่อง

ตัวอย่างค่าเริ่มต้น:

```text
GPS accuracy ไม่เกิน 30 เมตร
อยู่นอกขอบเขตเกิน 15–20 เมตร
และต่อเนื่องเกินระยะเวลาที่กำหนด
```

---

## 11. Workflow การตรวจของครู

สถานะ Observation:

```text
draft
→ analyzing
→ student_review
→ submitted
→ teacher_review
   ├─ verified
   ├─ revision_required
   ├─ unable_to_verify
   └─ rejected
```

### Verified

ครูยืนยันว่าข้อมูลและหลักฐานเพียงพอ

### Revision required

ส่งกลับให้นักเรียนแก้ไข เช่น ขอภาพด้านใต้ใบ ขอให้ตรวจการเรียงใบใหม่ หรือให้ปรับข้อมูลตำแหน่ง

### Unable to verify

ข้อมูลยังไม่เพียงพอ แต่ไม่ถือว่าเป็นข้อมูลผิด

### Rejected

ใช้กรณีภาพไม่เกี่ยวข้อง ไม่ใช่พืช ข้อมูลไม่เหมาะสม เป็นรายการซ้ำที่ยืนยันแล้ว หรืออยู่นอกกิจกรรมอย่างชัดเจน

ครูต้องเห็น:

- ภาพทั้งหมด
- ชื่อและลักษณะที่ Gemini วิเคราะห์
- คำตอบของนักเรียน
- ค่าที่นักเรียนแก้ไข
- ตำแหน่งและ GPS accuracy
- เวลาถ่ายและเวลาส่ง
- ผล Dedupe
- ประวัติการแก้ไข

---

## 12. แผนที่และ Realtime

ใช้ Mapbox GL JS สำหรับ:

- แสดงเส้นทาง
- แสดงขอบเขตพื้นที่
- แสดงตำแหน่งนักเรียน
- แสดงตำแหน่งสมาชิกกลุ่ม
- แสดงจุดตรวจ
- แสดง Marker ของพืชที่บันทึก
- แสดง GPS accuracy radius

ใช้ Supabase Realtime:

### Broadcast

สำหรับข้อมูลที่เปลี่ยนถี่:

- ตำแหน่ง
- Heading
- Speed
- GPS accuracy
- Checkpoint reached
- Teacher alert

### Presence

สำหรับสถานะที่เปลี่ยนไม่ถี่:

- ออนไลน์หรือออฟไลน์
- ready
- exploring
- paused
- last heartbeat

ตัวอย่าง Channel:

```text
session:{sessionId}:group:{groupId}
session:{sessionId}:teachers
```

ไม่ควรบันทึก GPS ทุกวินาทีลงฐานข้อมูล ให้ Broadcast ตำแหน่งถี่กว่า และบันทึก durable sample เป็นช่วงหรือเมื่อเกิดเหตุการณ์สำคัญ

---

## 13. Offline และการ Sync

ระบบต้องรองรับกรณีอินเทอร์เน็ตไม่เสถียร

เมื่อ Offline:

- เก็บ Observation draft ใน IndexedDB
- เก็บภาพรออัปโหลด
- เก็บตำแหน่งและเวลา
- ใช้ `client_generated_id`
- แสดงสถานะ Pending Sync

เมื่อกลับมา Online:

```text
Pending
→ Uploading
→ Synced
→ Conflict หรือ Failed
```

การ Retry ต้องไม่สร้าง Observation ซ้ำ

---

## 14. โครงสร้างฐานข้อมูลสำคัญ

ตารางหลัก:

```text
profiles
schools
school_memberships
classes
class_members
class_invites
groups
group_members
activities
activity_routes
activity_boundaries
activity_checkpoints
exploration_sessions
exploration_session_groups
session_participants
location_events
location_tracks
observations
observation_media
ai_analysis_runs
ai_plant_candidates
ai_observed_traits
student_trait_verifications
student_identification_edits
teacher_reviews
observation_duplicate_candidates
specimens
observation_status_history
audit_logs
```

### observations

ข้อมูลสำคัญ:

```text
id
client_generated_id
session_id
activity_id
group_id
observer_id
capture_location
capture_accuracy_m
captured_at
submission_location
submission_accuracy_m
submitted_at
status
student_selected_identification_id
teacher_verified_identification_id
specimen_id
created_at
updated_at
```

### ai_analysis_runs

```text
id
observation_id
provider
model
prompt_version
status
started_at
completed_at
error_code
raw_response_path
```

### student_trait_verifications

```text
id
observation_id
trait_key
ai_value
student_status
student_corrected_value
student_note
verified_at
```

### teacher_reviews

```text
id
observation_id
reviewer_id
decision
verified_common_name
verified_scientific_name
feedback
reviewed_at
```

### observation_duplicate_candidates

```text
id
observation_id
candidate_observation_id
taxon_match_score
trait_match_score
visual_similarity_score
location_distance_m
temporal_distance_seconds
combined_score
system_recommendation
student_decision
teacher_decision
created_at
```

---

## 15. ความปลอดภัยและสิทธิ์ข้อมูล

- ใช้ Supabase Auth สำหรับตัวตน
- เก็บสิทธิ์ใน Membership Table
- เปิด RLS ทุกตารางใน public schema
- นักเรียนเห็นเฉพาะข้อมูลในชั้นเรียนและ Session ที่ได้รับสิทธิ์
- นักเรียนส่งตำแหน่งได้เฉพาะช่วงที่ Session เปิดและกลุ่มตน active
- ครูเห็นตำแหน่งของ Session ที่ตนดูแล
- ห้ามเปิดเผยตำแหน่งนักเรียนต่อสาธารณะ
- ห้ามใส่ service role key ใน Client
- ภาพ Observation เป็น private โดยค่าเริ่มต้น
- เก็บ Audit Log สำหรับการเปลี่ยนสิทธิ์ การเปิด Session การยืนยัน และการแก้ไขสำคัญ

---

## 16. Tech Stack

```text
Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- Zustand

Backend
- Supabase Auth
- PostgreSQL
- PostGIS
- Supabase Realtime
- Supabase Storage
- Supabase Edge Functions หรือ Next.js Server Routes

Map
- Mapbox GL JS

AI
- Gemini ผ่าน Provider Adapter

Deployment
- Vercel
- Supabase Hosted Project
```

---

## 17. ขอบเขต MVP

### ต้องมีใน Pilot MVP

1. Authentication และ RBAC
2. ครูสร้าง Class
3. นักเรียน Join Class
4. นักเรียนสร้างหรือเข้าร่วมกลุ่ม
5. ครูสร้าง Activity พร้อมขอบเขตและเส้นทาง
6. ครูเปิด Session และเลือกกลุ่ม active
7. แผนที่ Realtime
8. นักเรียนถ่ายภาพพืชพร้อมตำแหน่งและเวลา
9. Gemini วิเคราะห์ชื่อและลักษณะพืช
10. นักเรียนตรวจสอบและแก้ไขข้อมูล
11. ตรวจชนิดพืชซ้ำและต้นเดิมซ้ำ
12. Submit ให้ครูตรวจ
13. ครูยืนยันหรือส่งกลับแก้ไข
14. Offline draft และ idempotent sync
15. Export CSV หรือ GeoJSON

### เลื่อนไปภายหลัง

- Public feed
- Community identification ข้ามชั้นเรียน
- ผู้เชี่ยวชาญภายนอก
- ระบบโหวตแบบ iNaturalist เต็มรูปแบบ
- การฝึกโมเดล Computer Vision ของตนเอง
- Background location เมื่อปิดหน้าจอ
- AR navigation
- ระบบ Gamification ขนาดใหญ่

---

## 18. ลำดับการพัฒนา

### Phase 1: Foundation

- สร้าง Next.js project
- ตั้งค่า Supabase
- Authentication
- Profiles
- CI และ Testing

### Phase 2: Class และ RBAC

- Classes
- Memberships
- Invite code
- RLS policies

### Phase 3: Group และ Activity

- Groups
- Route builder
- Boundary builder
- Checkpoints

### Phase 4: Session และ Realtime

- Session lifecycle
- One active group constraint
- Mapbox
- Broadcast และ Presence

### Phase 5: Plant Observation Vertical Slice

- ถ่ายภาพ
- บันทึกตำแหน่งและเวลา
- Gemini analysis
- Student verification
- Dedupe
- Submit
- Teacher review

### Phase 6: Offline และ Reporting

- IndexedDB
- Sync queue
- Export
- Audit และ retention

---

## 19. Acceptance Criteria สำคัญ

ระบบถือว่าผ่าน MVP เมื่อ:

1. ครูสร้าง Class และนักเรียน Join ได้
2. นักเรียนสองกลุ่มอยู่ใน Session เดียวกันได้
3. มีเพียงหนึ่งกลุ่ม active ในเวลาเดียวกัน
4. นักเรียนกลุ่ม active เห็นเส้นทางและตำแหน่งสมาชิก
5. นักเรียนถ่ายภาพพืชพร้อมตำแหน่งและเวลาได้
6. Gemini ส่งข้อมูลแบบ Structured JSON กลับมา
7. นักเรียนตรวจแต่ละลักษณะและแก้ไขได้
8. ระบบตรวจชนิดพืชซ้ำโดยไม่ใช้ระยะห่างอย่างเดียว
9. ระบบตรวจต้นเดิมซ้ำจากชนิด ลักษณะ ภาพ ตำแหน่ง และเวลา
10. ระบบไม่รวมรายการซ้ำอัตโนมัติ
11. ครูเห็นข้อมูล AI ข้อมูลนักเรียน ตำแหน่ง และเวลาแยกกัน
12. ครูส่งกลับแก้ไขหรือยืนยันได้
13. Observation ที่สร้าง Offline Sync แล้วไม่ซ้ำ
14. ผู้ใช้ต่าง Class ไม่สามารถเห็นข้อมูลกันได้

---

## 20. หลักการสำคัญของระบบ

```text
AI วิเคราะห์
→ นักเรียนตรวจสอบกับของจริง
→ นักเรียนยืนยันหรือแก้ไข
→ ระบบตรวจความซ้ำ
→ ครูตรวจสอบขั้นสุดท้าย
```

ระบบนี้ไม่ควรเป็นเพียงแอประบุชื่อพืช แต่ต้องช่วยให้นักเรียนฝึกสังเกต เปรียบเทียบ ตรวจสอบหลักฐาน และตัดสินใจจากสิ่งที่พบจริงในพื้นที่