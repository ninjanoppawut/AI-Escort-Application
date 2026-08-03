# สรุประบบ AI Escort Application ฉบับภาษาไทย

เอกสารฉบับนี้เป็นสรุป Requirement และแนวทางพัฒนา MVP ล่าสุดในไฟล์เดียว เพื่อใช้สำหรับตรวจสอบแนวคิด ส่งต่อให้นักพัฒนา หรือให้ AI Coding Agent เริ่มสร้างระบบ

---

## 1. เป้าหมายของระบบ

AI Escort Application เป็นแอปพลิเคชันแบบ Mobile-first สำหรับจัดกิจกรรมสำรวจพืชในพื้นที่ที่ครูกำหนด นักเรียนเดินสำรวจจริง ถ่ายภาพพืช ส่งภาพให้ Gemini วิเคราะห์ชื่อพืชและลักษณะที่มองเห็น จากนั้นนักเรียนต้องตรวจสอบผลกับต้นพืชจริง แก้ไขข้อมูลที่ไม่ตรง และส่งให้ครูตรวจสอบด้วยตนเอง

AI ทำหน้าที่เป็นผู้ช่วยเสนอข้อมูล ไม่ใช่ผู้ยืนยันคำตอบสุดท้าย ครูเป็นผู้ตรวจและยืนยันผลขั้นสุดท้าย

Flow หลัก:

```text
ครูสร้างชั้นเรียน กิจกรรม เส้นทาง ขอบเขต และ Session
→ นักเรียนเข้าชั้นเรียนและสร้าง/เข้าร่วมกลุ่ม
→ ครูเปิดกลุ่มให้สำรวจทีละกลุ่ม
→ นักเรียนเดินในพื้นที่ที่กำหนด
→ นักเรียนถ่ายภาพพืช
→ ระบบบันทึกตำแหน่ง GPS ความแม่นยำ และเวลาที่ถ่าย
→ ส่งงานวิเคราะห์ภาพเข้า Queue
→ Gemini วิเคราะห์ชื่อและลักษณะพืช
→ นักเรียนตรวจสอบข้อมูลกับต้นพืชจริง
→ นักเรียนยืนยันหรือแก้ไขข้อมูล
→ ระบบตรวจว่ามีพืชชนิดเดียวกันใน Session แล้วหรือไม่
→ เตือนแต่ยังอนุญาตให้ส่ง
→ นักเรียน Submit
→ Marker แสดงบนแผนที่ฝั่งครู
→ ครูตรวจ ยืนยัน แก้ไข ส่งกลับแก้ หรือปฏิเสธ
→ หากส่งกลับ นักเรียนแก้ Observation เดิมและ Submit ใหม่
→ ครูกดจบกิจกรรมด้วยตนเอง
→ หลังจบ ครูและนักเรียนดูแผนที่ผลการสำรวจและกด Marker เพื่อดูรายละเอียดพืชได้
```

---

## 2. ผู้ใช้งานและสิทธิ์

### 2.1 นักเรียน

นักเรียนสามารถ:

- เข้าร่วม Class ด้วยรหัสหรือ Link
- สร้างหรือเข้าร่วมกลุ่ม
- ดูข้อมูลกิจกรรม เส้นทาง และขอบเขต
- ดูเส้นทางล่วงหน้าในระหว่างรอกลุ่ม
- ส่งตำแหน่งสดและสร้าง Observation เมื่อกลุ่มของตนเป็น `active`
- สร้าง Observation ส่วนบุคคล
- ถ่ายภาพ 1–10 ภาพต่อ Observation
- รับผลวิเคราะห์จาก Gemini
- ตรวจสอบลักษณะพืชกับต้นจริง
- แก้ชื่อพืชและลักษณะที่ AI ระบุไม่ตรง
- กรอกชื่อพืชภาษาไทย/ชื่อสามัญและชื่อวิทยาศาสตร์
- ใช้แหล่งภายนอก เช่น Google Lens แล้วกรอกข้อมูลด้วยตนเองได้
- รับคำเตือนเมื่อมีพืชชนิดเดียวกันใน Session
- ส่ง Observation ซ้ำชนิดกันได้ เพราะเป็นผลงานรายบุคคล
- แก้ไข Observation เดิมเมื่อครูส่งกลับ
- ดูแผนที่ผลการสำรวจหลังจบกิจกรรม
- กด Marker เพื่อดูรายละเอียดพืช

นักเรียนไม่สามารถ:

- ส่งตำแหน่งหรือ Observation ระหว่างที่กลุ่มยังไม่ active
- ยืนยันผลแทนครู
- แก้ผลตรวจของครู
- เห็นข้อมูลที่ไม่ได้รับอนุญาตจาก Class/Session อื่น

### 2.2 ครู

ครูสามารถ:

- สร้างและจัดการ Class
- เชิญนักเรียน
- สร้างกลุ่มหรือจัดการสมาชิกกลุ่ม
- สร้าง Activity, เส้นทาง, ขอบเขต และ Checkpoint
- สร้าง เปิด พัก และจบ Session
- เปิดให้มีเพียงหนึ่งกลุ่ม active ในเวลาเดียวกัน
- ดูตำแหน่งสมาชิกแบบ Realtime
- ดู Observation ที่นักเรียน Submit เป็น Marker บนแผนที่
- เห็น Tag ว่าพืชชนิดนี้ถูกส่งมาแล้วใน Session เดียวกัน
- กด Marker เพื่อดูภาพ ผล Gemini คำตอบนักเรียน ตำแหน่ง เวลา และประวัติ
- ตรวจสอบด้วยตนเอง
- ยืนยันชื่อพืช
- แก้ชื่อสามัญ ชื่อวิทยาศาสตร์ หรือลักษณะพืช
- ส่งกลับให้นักเรียนแก้ไข
- ระบุว่าไม่สามารถยืนยันได้
- ปฏิเสธ Observation
- กดจบกิจกรรมด้วยตนเอง
- ดูแผนที่หลังจบกิจกรรมและ Export ข้อมูล

### 2.3 Admin

Admin จัดการระบบระดับ Platform เช่น ผู้ใช้ โรงเรียน การตั้งค่าระบบ AI และ Audit Log แต่การเข้าถึงข้อมูล Class ต้องมีการควบคุมอย่างชัดเจน ไม่ใช่ให้หน้า UI ทั่วไปมองเห็นทุกอย่างโดยอัตโนมัติ

---

## 3. โครงสร้างหลักของระบบ

```text
School
 └─ Class
     ├─ Class Members
     ├─ Groups
     └─ Activities
         ├─ Route
         ├─ Boundary
         ├─ Checkpoints
         └─ Exploration Sessions
             ├─ Session Groups
             ├─ Session Participants
             ├─ Live Locations
             ├─ Individual Observations
             ├─ Gemini Analyses
             ├─ Student Submissions/Revisions
             └─ Teacher Reviews
```

- **Activity** คือแผนกิจกรรมที่นำกลับมาใช้ใหม่ได้
- **Session** คือการดำเนิน Activity จริงในวันและเวลาหนึ่ง
- **Observation** เป็นผลงานของนักเรียนหนึ่งคน ไม่ใช่ของกลุ่ม

---

## 4. กฎหนึ่งกลุ่ม Active

ใน Session เดียวกันมีเพียงหนึ่งกลุ่มที่เป็น `active` ได้ในเวลาเดียวกัน

```sql
create unique index one_active_group_per_session
on exploration_session_groups(session_id)
where status = 'active';
```

กฎนี้ต้องบังคับที่ PostgreSQL ไม่ใช่เช็กเฉพาะหน้าเว็บ

กลุ่มที่รอ:

- ดูเส้นทางและข้อมูลกิจกรรมได้
- ยังส่งตำแหน่งสดไม่ได้
- ยังสร้างหรือ Submit Observation ไม่ได้

การสลับกลุ่มต้องทำผ่าน Transaction/RPC เดียว เพื่อไม่ให้ครูสองคนเปิดคนละกลุ่มพร้อมกัน

---

## 5. Flow การสร้าง Observation

### ขั้นที่ 1 เริ่ม Observation

เมื่อนักเรียนพบพืชและกดเพิ่ม Observation ระบบบันทึก:

- นักเรียนผู้สร้าง
- Class / Activity / Session / Group
- `capture_location`
- `capture_accuracy_m`
- `captured_at`
- `client_generated_id` สำหรับ Offline/Retry

ตำแหน่งที่แสดง Marker คือ **ตำแหน่งตอนถ่าย/เริ่ม Observation** ไม่ใช่ตำแหน่งตอน Submit

### ขั้นที่ 2 ถ่ายภาพ

Observation หนึ่งรายการ:

- อย่างน้อย 1 ภาพ
- สูงสุด 10 ภาพ
- ต้องมีภาพทั้งต้นอย่างน้อย 1 ภาพ

หมวดภาพที่รองรับ:

```text
whole_plant
leaf
leaf_underside
stem_trunk
flower
fruit
habitat
other
```

### ขั้นที่ 3 เตรียมภาพก่อน Upload

บนอุปกรณ์นักเรียน ระบบควร:

1. แก้ Orientation ของภาพ
2. เก็บเวลาถ่ายในฐานข้อมูลแยกจาก EXIF
3. หากด้านยาวเกิน 2,048 px ให้ Resize
4. Compress คุณภาพประมาณ 82–85
5. จำกัดไฟล์ที่ผ่านการประมวลผลไม่เกิน 5 MB ต่อภาพ
6. Upload เข้า Supabase Storage แบบ Private

ขนาดแสดงผลที่แนะนำ:

```text
Marker preview: 256 px
Observation list: 512 px
Teacher review: 1,200 px
Gemini/ภาพหลัก: สูงสุด 2,048 px
```

---

## 6. Worker สำหรับ Gemini

Gemini ไม่ควรทำงานผ่าน Request ที่ต้องเปิดหน้าเว็บค้างไว้

MVP ใช้:

```text
Supabase Queue
+ Supabase Edge Function Consumer
+ Gemini Provider Adapter
```

Flow:

```text
Upload ภาพสำเร็จ
→ สร้าง ai_analysis_run
→ ส่ง Job เข้า Queue
→ Edge Function รับ Job
→ โหลดภาพ Private ที่ได้รับอนุญาต
→ ส่ง Gemini
→ ตรวจ JSON ที่ตอบกลับ
→ บันทึกผลแบบ Versioned
→ อัปเดตสถานะ
→ แจ้ง Client ผ่าน Realtime/Database State
```

ถ้า Gemini ล้มเหลว:

- Draft ต้องไม่หาย
- นักเรียนกด Retry ได้
- นักเรียนกรอกข้อมูลด้วยตนเองได้
- นักเรียนใช้ Google Lens ภายนอกแล้วกลับมากรอกได้

สิ่งที่ยังไม่จำเป็นใน MVP:

- Redis/BullMQ
- Worker Server แยก
- Kubernetes
- GPU Server

---

## 7. ผลลัพธ์จาก Gemini

Gemini ต้องตอบกลับในรูปแบบ Structured JSON ที่มี Version ห้ามใช้ข้อความอิสระอย่างเดียว

โครงสร้างจริงจะกำหนดอีกครั้งตอนเชื่อม Gemini แต่ต้องรองรับข้อมูลต่อไปนี้:

```json
{
  "schemaVersion": "plant-analysis-v1",
  "identificationStatus": "possible_match",
  "candidates": [
    {
      "commonNameTh": "มะม่วง",
      "commonNameEn": "Mango",
      "scientificName": "Mangifera indica",
      "confidence": 0.87,
      "evidenceSummary": "ลักษณะใบและลำต้นสอดคล้องบางส่วน"
    }
  ],
  "traits": {
    "plantType": {"value": "ไม้ต้น", "visibility": "visible"},
    "leafType": {"value": "ใบเดี่ยว", "visibility": "visible"},
    "leafArrangement": {"value": "เรียงสลับ", "visibility": "uncertain"},
    "flower": {"value": null, "visibility": "not_visible"}
  },
  "missingEvidence": ["leaf_underside"],
  "disclaimer": "ผลลัพธ์เป็นข้อเสนอเบื้องต้น"
}
```

ทุก AI Run ต้องเก็บ:

- Provider
- Model
- Prompt Version
- Response Schema Version
- สถานะ Queue/Run
- เวลาเริ่มและเวลาจบ
- จำนวนครั้งที่ Retry
- Error Code
- Usage Metadata ที่จำเป็น

หากภาพไม่เห็นดอก ผล หรือลักษณะใด Gemini ต้องตอบ `null` หรือ `not_visible` ห้ามเดาข้อมูล

### Confidence เริ่มต้น

```text
ต่ำกว่า 0.40
→ แจ้งว่าหลักฐานไม่พอและขอภาพเพิ่ม

0.40–0.70
→ แสดงหลาย Candidate และลักษณะที่ใช้แยก

มากกว่า 0.70
→ เน้น Candidate แรก แต่ยังต้องแสดงว่าเป็นผลชั่วคราว
```

Threshold ต้องแก้ได้ภายหลัง

---

## 8. การตรวจสอบโดยนักเรียน

นักเรียนต้องเทียบผล Gemini กับต้นพืชจริง

แต่ละลักษณะเลือกได้:

```text
match       = ตรง
not_match   = ไม่ตรง
unsure      = ไม่แน่ใจ
not_visible = มองไม่เห็น
```

ถ้าเลือก `not_match` นักเรียนสามารถใส่ค่าที่แก้ไขและหมายเหตุได้

ตัวอย่าง:

```text
Gemini: ใบเรียงสลับ
นักเรียน: ไม่ตรง
ค่าที่แก้: ใบเรียงตรงข้าม
หมายเหตุ: ตรวจจากกิ่งจริงแล้ว
```

ระบบต้องเก็บแยก:

- ผล Gemini
- ผลตรวจของนักเรียน
- ค่าที่นักเรียนแก้
- Submission แต่ละ Version
- ผลตรวจและค่าที่ครูแก้

ห้ามเขียนทับข้อมูลเดิม

---

## 9. ข้อมูลบังคับก่อน Submit

ก่อน Submit นักเรียนต้องมี:

- ภาพทั้งต้นอย่างน้อย 1 ภาพ
- ภาพรวมทั้งหมดไม่เกิน 10 ภาพ
- ชื่อพืชภาษาไทยหรือชื่อสามัญ
- ชื่อวิทยาศาสตร์
- ข้อความสั้นอธิบายหลักฐาน
- ผลตรวจลักษณะจาก Gemini หรือระบุว่าใช้ Manual Entry
- ยอมรับคำเตือนพืชชนิดเดียวกัน หากระบบพบ

ระบบไม่อนุญาตให้ใช้ `Unknown` เป็นคำตอบสุดท้าย นักเรียนต้องหาข้อมูลให้ได้ อาจเลือกจาก Gemini หรือใช้ Google Lens/แหล่งข้อมูลอื่นแล้วกรอกเอง

---

## 10. การตรวจพืชซ้ำ

ระบบต้องแยกเป็น 2 แบบ

### 10.1 พืชชนิดเดียวกันใน Session

หลังนักเรียนเลือกหรือกรอกชื่อ ระบบค้นหา Observation ที่ Submit แล้วใน Session เดียวกัน

หากพบชนิดเดียวกัน:

- แจ้งนักเรียนว่ามีชนิดนี้แล้ว
- แสดงรายการที่เกี่ยวข้องเมื่อมีสิทธิ์
- ยังอนุญาตให้ Submit เพราะเป็นผลงานรายบุคคล
- บันทึกว่า Student รับทราบ
- ตั้งค่า `same_species_in_session = true`
- แสดง Tag ให้ครูเห็นบน Review/Marker Detail

ห้าม Block การส่ง

### 10.2 อาจเป็นต้นเดียวกัน

ใช้ข้อมูลหลายปัจจัยร่วมกัน:

- ชนิดพืช
- ลักษณะทางสัณฐาน
- ความคล้ายของภาพ
- ระยะห่างตำแหน่ง
- ช่วงเวลาที่ถ่าย

ห้ามใช้ระยะห่างอย่างเดียว

ระบบแค่เสนอว่าอาจเป็นต้นเดียวกัน ห้าม Merge, Delete หรือ Reject อัตโนมัติ หากคนยืนยันว่าเป็นต้นเดียวกัน Observation หลายรายการยังคงอยู่ได้ และอ้างถึง `specimen_id` เดียวกัน

---

## 11. สถานะ Observation

```text
draft
→ images_uploading
→ analysis_queued
→ analysis_running
→ student_review
→ submitted
→ teacher_review
   ├─ verified
   ├─ revision_required
   ├─ unable_to_verify
   └─ rejected
```

ถ้าครูส่งกลับ:

```text
revision_required
→ student_review
→ resubmitted
→ teacher_review
```

นักเรียนแก้ Observation เดิม ไม่สร้างรายการใหม่ แต่ระบบสร้าง Submission Version ใหม่และเก็บ Version เดิมไว้

---

## 12. การตรวจของครู

ครูเห็นข้อมูล:

- Marker ตำแหน่งตอนถ่าย
- GPS Accuracy
- เวลาถ่าย
- ภาพ 1–10 ภาพ
- ผล Gemini
- Confidence
- สิ่งที่นักเรียนกดตรง/ไม่ตรง/ไม่แน่ใจ/มองไม่เห็น
- ค่าที่นักเรียนแก้
- ชื่อพืชที่นักเรียน Submit
- Evidence Note
- Tag ว่าพืชชนิดเดียวกันอยู่ใน Session แล้ว
- รายการที่เกี่ยวข้อง
- Submission และ Review History

ครูเลือก:

```text
verified
revision_required
unable_to_verify
rejected
```

ครูสามารถแก้:

- ชื่อภาษาไทย/ชื่อสามัญ
- ชื่อวิทยาศาสตร์
- ลักษณะพืช
- Feedback

ค่าที่ครูแก้ต้องเก็บแยก ไม่เขียนทับผล Gemini หรือนักเรียน

---

## 13. แผนที่ระหว่างกิจกรรม

### ฝั่งครู

Observation ที่ Submit แล้วจะแสดงเป็น Marker ที่ `capture_location`

Draft ของนักเรียนยังไม่แสดง

สถานะ Marker แนะนำ:

```text
submitted / teacher_review = สีเหลืองอำพัน
revision_required          = สีแดง
resubmitted                = สีฟ้า
verified                   = สีเขียว
unable_to_verify           = สีม่วง
rejected                   = สีเทา
```

ต้องมี Icon/ข้อความ/รูปทรงร่วมด้วย ไม่ใช้สีอย่างเดียว

เมื่อกด Marker เปิด Plant Detail Panel

### ฝั่งนักเรียน

นักเรียนเห็นเส้นทาง ขอบเขต จุดตรวจ ตำแหน่งตนเอง/สมาชิกตามสิทธิ์ และ Observation ที่อนุญาตให้ดู

---

## 14. แผนที่หลังจบกิจกรรม

ครูเป็นผู้กด Complete ด้วยตนเอง ไม่มีเงื่อนไขจบอัตโนมัติ

หลังจบ:

- ครูดูแผนที่ผลการสำรวจได้
- นักเรียนที่เข้าร่วมดูแผนที่ผลการสำรวจได้
- Marker ใช้ตำแหน่งตอนถ่าย
- กด Marker เปิดรายละเอียดพืชได้

รายละเอียด Marker ประกอบด้วย:

- ภาพหลักและ Gallery
- ชื่อที่นักเรียนส่ง
- ชื่อที่ครูยืนยัน หากมี
- ตำแหน่ง ความแม่นยำ และเวลาถ่าย
- ผล Gemini
- คำตอบและค่าที่นักเรียนแก้
- Feedback/ผลตรวจของครู
- Same-species Tag
- Observation ที่เกี่ยวข้อง

ข้อมูลตำแหน่งสดย้อนหลังของนักเรียนไม่จำเป็นต้องแสดงในหน้าผลลัพธ์

---

## 15. GPS และ Offline

### GPS ใช้งานไม่ได้

1. แจ้งให้นักเรียนรอและ Retry
2. หากยังไม่ได้ ให้สร้าง Draft ที่ติด Flag ว่าไม่มีตำแหน่ง
3. ครูเป็นผู้จัดการ/ยอมรับกรณีดังกล่าว
4. ห้ามสร้างพิกัดปลอม

### Offline

ใช้ IndexedDB เก็บ:

- Observation Draft
- Client-generated UUID
- ภาพรอ Upload
- Upload Retry
- AI Job State
- Research Event ที่ยังไม่ Sync

การ Retry ต้อง Idempotent ห้ามสร้าง Observation หรือภาพซ้ำ

---

## 16. JSONB และโครงสร้างข้อมูล

ใช้ Column ปกติสำหรับข้อมูลที่ต้อง Query, Join, ทำ RLS หรือแสดง Marker เช่น:

```text
observer_id
class_id
activity_id
session_id
status
capture_location
captured_at
student_common_name
student_scientific_name
teacher_verified_name
```

ใช้ `jsonb` สำหรับข้อมูลที่ยืดหยุ่น เช่น:

```text
Gemini normalized result
Additional traits
Student verification snapshot
Teacher corrected traits
Device context
Research event payload
```

ไม่ควรเก็บ Lifecycle ทั้งหมดใน JSON ก้อนเดียว เพราะจะ Query, RLS และรักษาประวัติยาก

---

## 17. Research Event Log

ระบบต้องเก็บ Event สำคัญแบบ Append-only เช่น:

```text
session_joined
observation_started
photo_captured
image_uploaded
ai_analysis_queued
ai_analysis_completed
ai_analysis_failed
student_reviewed_ai_result
student_corrected_ai_trait
same_species_warning_shown
observation_submitted
teacher_requested_revision
observation_resubmitted
teacher_verified
session_completed
map_marker_opened
```

ตาราง Event มี ID ความสัมพันธ์เป็น Column และรายละเอียดที่เปลี่ยนแปลงได้ใน `payload jsonb`

ตัวแปรงานวิจัยสุดท้ายยังไม่ถูกล็อก แต่โครงนี้ทำให้ Export วิเคราะห์ภายหลังได้โดยไม่ต้องสร้างระบบใหม่

---

## 18. Database หลัก

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
observation_ai_results
student_trait_verifications
observation_submissions
teacher_reviews
observation_status_history
observation_duplicate_candidates
specimens
research_events
```

---

## 19. Security และ RLS

- ทุก Table ใน Public/Exposed Schema ต้องเปิด RLS
- Role ใน UI ไม่เพียงพอ ต้องตรวจ Membership ในฐานข้อมูล
- นักเรียนแก้ได้เฉพาะ Observation ของตนในสถานะที่อนุญาต
- นักเรียนแก้ Submission Version เก่าหรือ Teacher Review ไม่ได้
- ครูตรวจได้เฉพาะ Class ที่ตนสอน
- Storage เป็น Private
- URL ภาพต้องผ่านสิทธิ์หรือ Signed URL
- Gemini Key และ Service Role ห้ามอยู่ใน Browser
- ห้ามส่งตำแหน่งสดของนักเรียนคนอื่นเข้า Gemini
- Research/Audit Tables ไม่เปิดให้นักเรียนอ่านทั่วไป

---

## 20. Tech Stack

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
- Mapbox GL JS

Backend
- Supabase Auth
- PostgreSQL
- PostGIS
- Supabase Realtime
- Supabase Storage
- Supabase Queue
- Supabase Edge Functions

AI
- Gemini Provider Adapter
- Versioned Prompt
- Versioned JSON Schema

Offline
- IndexedDB
```

---

## 21. ลำดับการพัฒนา

### Phase 1

Foundation, Auth, Class, Membership, RLS

### Phase 2

Group, Activity, Route, Boundary, Session Participant Snapshot

### Phase 3

One-active-group Constraint, Session Control, Live Map

### Phase 4

Individual Observation, Capture Location/Time

### Phase 5

Image Processing, Storage, 1–10 Images

### Phase 6

Queue + Edge Function + Gemini

### Phase 7

Student Verification, Required Names, Same-species Warning

### Phase 8

Teacher Map, Marker Detail, Manual Review, Revision

### Phase 9

Completed Activity Map สำหรับครูและนักเรียน

### Phase 10

Offline Hardening, Export, Retention, Research Data

---

## 22. Acceptance Criteria สำคัญ

MVP ถือว่าทำงานได้เมื่อ:

1. ครูสร้าง Class, Activity, Route, Boundary และ Session ได้
2. นักเรียนเข้ากลุ่มได้
3. ระบบป้องกัน Active สองกลุ่มพร้อมกันได้จริง
4. นักเรียนสร้าง Observation ส่วนบุคคลได้
5. บันทึกตำแหน่ง เวลา และ GPS Accuracy ได้
6. Upload ภาพ 1–10 ภาพ โดย Resize/Compress ตาม Spec
7. Gemini ทำงานผ่าน Queue และตอบแบบ Versioned Structured Data
8. Gemini ล้มเหลวแล้ว Draft ไม่หาย และกรอก Manual ได้
9. นักเรียนตรวจลักษณะกับต้นจริงและแก้ค่าที่ไม่ตรงได้
10. บังคับชื่อพืชภาษาไทย/ชื่อสามัญและชื่อวิทยาศาสตร์ก่อน Submit
11. พบพืชชนิดเดียวกันแล้วเตือน แต่ยังส่งได้
12. ครูเห็น Same-species Tag
13. Observation ที่ Submit แสดงเป็น Marker ตามสถานะ
14. ครูกด Marker ดูรายละเอียดได้
15. ครูส่งกลับให้นักเรียนแก้ Observation เดิมได้
16. Student Resubmit โดยเก็บประวัติเดิม
17. ครูแก้และยืนยันชื่อพืชได้
18. ครูกดจบ Session ด้วยตนเอง
19. หลังจบ ครูและนักเรียนดูแผนที่และกด Marker ดูรายละเอียดได้
20. RLS ป้องกันข้อมูลข้าม Class/Session ได้

---

## 23. สิ่งที่ยังไม่ Block การเริ่มพัฒนา

สามารถเริ่มพัฒนาได้แล้ว โดยยังมีเรื่องที่ต้องตัดสินก่อน Pilot/Production แต่ไม่ Block งานพื้นฐาน:

- อายุของนักเรียนและ Consent
- ระยะเวลาเก็บ Location/Image/AI/Event Log
- Gemini Model และ Budget จริง
- แหล่ง Taxonomy มาตรฐานในอนาคต
- แบบวัด/ตัวแปรวิจัยและรูปแบบ Export ขั้นสุดท้าย
- เจ้าของ Account Production และผู้ดูแลระบบ

---

## 24. สรุปสั้นที่สุด

```text
นักเรียนแต่ละคนถ่ายพืช 1–10 ภาพในพื้นที่
→ ระบบเก็บตำแหน่งและเวลา
→ Queue ส่ง Gemini วิเคราะห์
→ นักเรียนตรวจข้อมูลกับต้นจริง
→ ต้องกรอกชื่อสามัญ/ไทยและชื่อวิทยาศาสตร์
→ ถ้าชนิดซ้ำใน Session ให้เตือนแต่ส่งได้
→ ครูเห็น Marker และ Same-species Tag
→ ครูตรวจ แก้ หรือส่งกลับ
→ ครูกดจบกิจกรรม
→ ครูและนักเรียนดูแผนที่ผลลัพธ์และกด Marker ดูรายละเอียดพืช
```

MVP นี้มี Requirement เพียงพอสำหรับเริ่มพัฒนาแล้ว โดยไม่มีคำถามด้าน Product Flow ที่ Block การเริ่ม Coding เหลืออยู่