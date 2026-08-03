# สรุประบบ AI Escort Application ฉบับภาษาไทย

เอกสารนี้เป็น Requirement ฉบับรวมล่าสุดสำหรับ MVP เพื่อใช้ตรวจสอบแนวคิด ส่งให้นักพัฒนา หรือให้ AI Coding Agent เริ่มพัฒนาระบบ โดยรวมทั้งระบบชั้นเรียน การสร้างกลุ่ม การแจ้งเตือน การสำรวจภาคสนาม การวิเคราะห์พืชด้วย Gemini และการตรวจงานของครู

---

## 1. เป้าหมายของระบบ

AI Escort Application เป็นเว็บแอปแบบ Mobile-first สำหรับจัดกิจกรรมสำรวจพืชในพื้นที่ที่ครูกำหนด นักเรียนทำงานเป็นกลุ่มเพื่อเดินสำรวจ แต่ Observation แต่ละรายการเป็นผลงานรายบุคคล

นักเรียนถ่ายภาพพืช ระบบบันทึกตำแหน่งและเวลา ส่งภาพให้ Gemini วิเคราะห์ชื่อและลักษณะที่มองเห็น จากนั้นนักเรียนต้องตรวจสอบผลกับต้นพืชจริง แก้ข้อมูลที่ไม่ตรง และ Submit ให้ครูตรวจด้วยตนเอง

AI เป็นเพียงผู้ช่วยเสนอข้อมูล ไม่ใช่ผู้ยืนยันคำตอบสุดท้าย

Flow หลักของระบบ:

```text
ครูสร้าง Class และตั้งค่าการแบ่งกลุ่ม
→ ครูเชิญนักเรียนด้วย Code / Link / QR
→ นักเรียนเข้าร่วม Class
→ นักเรียนบางคนสร้างกลุ่มและกลายเป็นหัวหน้ากลุ่ม
→ หัวหน้ากลุ่มเชิญเพื่อนใน Class ผ่านการแจ้งเตือนในแอป
→ เพื่อนกดยอมรับหรือปฏิเสธ
→ ครูตรวจ จัดกลุ่ม ย้ายสมาชิก เปลี่ยนหัวหน้า และล็อกกลุ่ม
→ ครูสร้าง Activity, Route, Boundary และ Session
→ ระบบ Snapshot สมาชิกของแต่ละกลุ่มสำหรับ Session นั้น
→ ครูเปิดให้สำรวจทีละหนึ่งกลุ่ม
→ นักเรียนเดินในพื้นที่และสร้าง Observation ส่วนบุคคล
→ ถ่ายภาพ 1–10 ภาพ พร้อมตำแหน่งและเวลา
→ ส่งงานวิเคราะห์เข้า Queue
→ Gemini วิเคราะห์ชื่อและลักษณะพืช
→ นักเรียนตรวจสอบกับต้นจริงและแก้ไข
→ ระบบเตือนหากมีพืชชนิดเดียวกันใน Session
→ นักเรียนยัง Submit ได้
→ Marker แสดงบนแผนที่ครูตามสถานะ
→ ครูตรวจ ยืนยัน แก้ไข ส่งกลับ หรือปฏิเสธ
→ ครูกดจบ Session ด้วยตนเอง
→ ครูและนักเรียนดูแผนที่ผลลัพธ์และกด Marker ดูรายละเอียดพืช
```

---

## 2. ผู้ใช้งานและสิทธิ์

### 2.1 นักเรียน

นักเรียนสามารถ:

- เข้าร่วม Class ด้วย Code, Link หรือ QR
- สร้างกลุ่มได้เมื่อครูเปิดการสร้างกลุ่มและยังมีช่องกลุ่มเหลือ
- เป็นหัวหน้ากลุ่มโดยอัตโนมัติเมื่อสร้างกลุ่มสำเร็จ
- เชิญเพื่อนใน Class ผ่านการแจ้งเตือนในแอป
- ยอมรับหรือปฏิเสธคำเชิญเข้ากลุ่ม
- อยู่ได้เพียงหนึ่งกลุ่มที่กำลังใช้งานใน Class เดียวกัน
- ดู Route และข้อมูลกิจกรรมล่วงหน้า
- ส่งตำแหน่งสดและสร้าง Observation เมื่อกลุ่มเป็น `active`
- ถ่ายภาพพืช 1–10 ภาพ
- รับผล Gemini และตรวจสอบกับต้นจริง
- กรอกชื่อไทย/ชื่อสามัญ ชื่อวิทยาศาสตร์ และเหตุผลประกอบ
- แก้ Observation เดิมเมื่อครูส่งกลับ
- ดูแผนที่ผลการสำรวจหลังจบกิจกรรม

### 2.2 หัวหน้ากลุ่ม

นักเรียนผู้สร้างกลุ่มจะเป็นหัวหน้ากลุ่มคนแรกและเป็นหัวหน้าคนเดียวในเวลาเดียวกัน

หัวหน้ากลุ่มสามารถ:

- ตั้งชื่อและแก้รายละเอียดกลุ่มก่อนล็อก
- ค้นหาเพื่อนที่ยังไม่มีกลุ่มใน Class เดียวกัน
- ส่งคำเชิญเข้ากลุ่ม
- ยกเลิกคำเชิญที่ยังไม่ตอบ
- นำสมาชิกออกก่อนกลุ่มถูกล็อก
- โอนตำแหน่งหัวหน้าให้สมาชิกคนอื่น
- แจ้งครูว่ากลุ่มพร้อม

หัวหน้ากลุ่มไม่สามารถ:

- สร้างกลุ่มที่สองใน Class เดียวกัน
- บังคับเพิ่มเพื่อนโดยไม่ให้เพื่อนกดยอมรับ
- เชิญคนที่อยู่กลุ่มอื่นแล้ว
- เพิ่มสมาชิกเกินจำนวนสูงสุด
- แต่งตั้งหัวหน้าพร้อมกันหลายคน
- แก้สมาชิกระหว่าง Session ที่กำลังดำเนินการ
- เปิดกลุ่มให้เริ่มสำรวจเอง

### 2.3 ครู

ครูสามารถ:

- สร้างและจัดการ Class
- ตั้งจำนวนสมาชิกขั้นต่ำ/สูงสุดต่อกลุ่ม
- ตั้งจำนวนกลุ่มสูงสุด
- เปิดหรือปิดการสร้างกลุ่มโดยนักเรียน
- สร้าง ปิด เปลี่ยน หรือยกเลิก Class Invite
- ดูทุกกลุ่มและนักเรียนที่ยังไม่มีกลุ่ม
- สร้างกลุ่มแทนนักเรียน
- ย้ายสมาชิกระหว่างกลุ่ม
- เปลี่ยนหัวหน้ากลุ่ม
- อนุมัติ ล็อก หรือปลดล็อกกลุ่ม
- ลบกลุ่มที่ยังไม่เคยใช้งาน
- Archive กลุ่มที่มีประวัติ Session แล้ว
- รวม/จัดใหม่กลุ่มที่สมาชิกไม่ครบ
- สร้าง Activity, Route, Boundary, Checkpoint และ Session
- เปิดให้มีเพียงหนึ่งกลุ่มสำรวจในเวลาเดียวกัน
- ดูตำแหน่งสมาชิกและ Marker ของ Observation
- ตรวจและแก้ผลพืชด้วยตนเอง
- ส่งกลับให้นักเรียนแก้ Observation เดิม
- กดจบ Session ด้วยตนเอง

### 2.4 Admin

Admin จัดการระบบระดับ Platform เช่น ผู้ใช้ โรงเรียน AI Provider การตั้งค่า และ Audit Log แต่ยังต้องมีการควบคุมสิทธิ์ตามโรงเรียนและ Class

---

## 3. การสร้าง Class และเชิญนักเรียน

ตอนสร้าง Class ครูกำหนด:

- ชื่อ Class
- วิชา
- ปีการศึกษาและภาคเรียน
- รายละเอียด
- จำนวนสมาชิกขั้นต่ำต่อกลุ่ม
- จำนวนสมาชิกสูงสุดต่อกลุ่ม
- จำนวนกลุ่มสูงสุด
- อนุญาตให้นักเรียนสร้างกลุ่มหรือไม่
- สถานะการสร้างกลุ่ม `open` หรือ `closed`

ครูจะถูกเพิ่มเป็นสมาชิก Role `teacher` โดยอัตโนมัติ

ระบบเชิญนักเรียนรองรับ:

- Class Code
- Invitation Link
- QR Code

Invite สามารถกำหนดวันหมดอายุ จำนวนครั้งที่ใช้ได้ และปิดการใช้งานได้

การ Join ต้องทำผ่าน Server/RPC ที่ตรวจ Invite และสร้าง Role เป็น `student` เท่านั้น นักเรียนไม่สามารถเลือก Role หรือกรอก Class ID เองเพื่อข้ามระบบได้

---

## 4. การสร้างกลุ่มโดยนักเรียน

นักเรียนกดสร้างกลุ่มได้เมื่อครบทุกเงื่อนไข:

```text
เป็น Student ที่ active ใน Class
AND ครูอนุญาตให้นักเรียนสร้างกลุ่ม
AND สถานะการสร้างกลุ่มเป็น open
AND นักเรียนยังไม่อยู่กลุ่มใด
AND นักเรียนยังไม่เคยใช้สิทธิ์สร้างกลุ่มใน Class นี้
AND จำนวนกลุ่มปัจจุบันยังไม่ถึง maximum_groups
```

เมื่อสร้างสำเร็จ:

- กลุ่มถูกสร้าง
- ผู้สร้างเป็น `leader`
- เพิ่มสมาชิกผู้สร้างเข้าในกลุ่ม
- บันทึกสิทธิ์ว่าเคยสร้างกลุ่มแล้ว
- ส่ง Realtime Event ให้หน้าจอของทุกคน Refetch

เมื่อจำนวนกลุ่มครบสูงสุด ปุ่ม **สร้างกลุ่ม** ต้องเป็น Disabled พร้อมข้อความอธิบาย ไม่ควรหายไปแบบไม่มีเหตุผล

ตัวอย่าง:

```text
ไม่สามารถสร้างกลุ่มเพิ่มได้
จำนวนกลุ่มครบตามที่ครูกำหนดแล้ว
กรุณาเข้าร่วมกลุ่มที่มีอยู่หรือรอคำเชิญ
```

---

## 5. ป้องกันการแย่งสร้างกลุ่มสุดท้าย

กรณีเหลือช่องกลุ่มสุดท้ายและนักเรียนสองคนกดพร้อมกัน Realtime อย่างเดียวไม่สามารถป้องกัน Race Condition ได้

ต้องใช้ RPC/Transaction:

```text
create_student_group(class_id, name, description)
```

ภายใน Transaction:

1. Lock Row การตั้งค่า Class
2. ตรวจสิทธิ์นักเรียน
3. ตรวจว่ายังไม่มีกลุ่ม
4. ตรวจว่ายังไม่เคยสร้างกลุ่ม
5. นับจำนวนกลุ่มปัจจุบัน
6. ถ้ายังมีช่อง ให้สร้างกลุ่มและหัวหน้า
7. Commit
8. Broadcast ว่ามีกลุ่มใหม่

ผลลัพธ์:

```text
Student A → สร้างสำเร็จ
Student B → GROUP_LIMIT_REACHED
```

Student B ต้อง Refetch และเห็นว่าช่องสุดท้ายถูกใช้ไปแล้ว

หลักการสำคัญ:

```text
Database Transaction = ความถูกต้อง
Realtime = อัปเดตหน้าจออย่างรวดเร็ว
```

---

## 6. การเชิญเพื่อนเข้ากลุ่ม

หัวหน้ากลุ่มสามารถเลือกได้เฉพาะเพื่อนที่:

- อยู่ Class เดียวกัน
- Membership เป็น active
- ยังไม่อยู่กลุ่มอื่น
- กลุ่มปลายทางยังไม่เต็ม
- ยังไม่มีคำเชิญ Pending ซ้ำ

หัวหน้าส่งคำเชิญผ่านระบบ นักเรียนปลายทางได้รับ Notification และเลือก:

```text
ยอมรับ
ปฏิเสธ
```

สถานะคำเชิญ:

```text
pending
accepted
declined
cancelled
expired
```

ตอนกดยอมรับ ระบบต้องตรวจซ้ำอีกครั้งว่านักเรียนยังไม่มีกลุ่มและกลุ่มยังไม่เต็ม เพราะข้อมูลอาจเปลี่ยนหลังจากส่งคำเชิญ

---

## 7. กฎกลุ่มและหัวหน้ากลุ่ม

กฎที่ต้องบังคับในฐานข้อมูล:

1. หนึ่งกลุ่มมีหัวหน้า active ได้เพียงหนึ่งคน
2. นักเรียนอยู่ได้เพียงหนึ่งกลุ่ม active/forming ต่อหนึ่ง Class
3. นักเรียนสร้างกลุ่มได้เพียงหนึ่งครั้งต่อ Class เว้นแต่ครู Reset สิทธิ์อย่างชัดเจน
4. จำนวนกลุ่มต้องไม่เกิน `maximum_groups`
5. จำนวนสมาชิกต้องไม่เกิน `max_group_size`
6. กลุ่มที่มีสมาชิกต้องไม่ถูกปล่อยให้ไม่มีหัวหน้า

ตัวอย่าง Index:

```sql
create unique index one_active_leader_per_group
on group_members(group_id)
where role = 'leader' and status = 'active';

create unique index one_active_group_per_student_per_class
on group_members(class_id, user_id)
where status = 'active';
```

Lifecycle ของกลุ่ม:

```text
forming → ready → approved → locked → archived
```

---

## 8. ครูย้ายสมาชิกและจัดการกลุ่ม

### ย้ายสมาชิก

ครูย้ายสมาชิกไปกลุ่มอื่นได้เมื่อ:

- Source และ Destination อยู่ Class เดียวกัน
- กลุ่มปลายทางยังไม่เต็ม
- นักเรียนไม่ได้กำลังเข้าร่วม Session ที่ active
- การย้ายไม่ทำให้กลุ่มเดิมที่มีสมาชิกเหลืออยู่ไม่มีหัวหน้า

ถ้านักเรียนที่ย้ายเป็นหัวหน้า ครูต้อง:

- เลือกหัวหน้าคนใหม่ หรือ
- ย้ายสมาชิกที่เหลือ หรือ
- ลบ/Archive กลุ่มถ้ากลุ่มว่าง

เมื่อย้ายสำเร็จ:

- สมาชิกกลุ่มปัจจุบันเปลี่ยน
- ทุกหน้าจอ Refetch ผ่าน Realtime
- นักเรียนได้รับ Notification
- บันทึก Audit และ Membership History

### ลบกลุ่ม

ถ้ากลุ่มยังไม่เคยถูกใช้ใน Session:

- ครูลบได้แบบ Soft Delete
- ยกเลิกคำเชิญ Pending
- สมาชิกกลับเป็นยังไม่มีกลุ่ม หรือย้ายตามที่ครูกำหนด
- ช่องจำนวนกลุ่มกลับมาเพิ่มหนึ่งช่อง
- แจ้งเตือนสมาชิก

ถ้ากลุ่มเคยถูกใช้ใน Session:

- ห้าม Hard Delete
- เปลี่ยนเป็น `archived`
- เก็บชื่อกลุ่ม สมาชิกเดิม Observation และข้อมูลวิจัยไว้

ระหว่าง Session ที่ active การย้าย ลบ เปลี่ยนหัวหน้า หรือแก้สมาชิกแบบปกติต้องถูก Block

---

## 9. Snapshot สมาชิกเมื่อเปิด Session

เมื่อครูเปิด Session ระบบต้อง Copy สมาชิกและ Role ของแต่ละกลุ่มไปยัง `session_participants`

```text
group_members = สมาชิกปัจจุบันสำหรับ Session ในอนาคต
session_participants = สมาชิกจริงของ Session นั้นในอดีต
```

หากครูย้ายนักเรียนหลังจบ Session ประวัติ Session เดิมต้องไม่เปลี่ยน

---

## 10. การแจ้งเตือนภายในแอป

MVP ใช้ In-app Notification ไม่ต้องใช้ Email

ระบบเก็บ Notification เป็น Row ใน PostgreSQL เพื่อให้นักเรียนเปิดแอปภายหลังแล้วยังเห็น และใช้ Realtime ส่งสัญญาณให้หน้าจออัปเดตทันที

ตัวอย่าง Notification นักเรียน:

- ได้รับคำเชิญเข้ากลุ่ม
- คำเชิญถูกยอมรับ/ปฏิเสธ
- ถูกย้ายไปกลุ่มใหม่
- ได้รับหรือถูกโอนตำแหน่งหัวหน้า
- กลุ่มถูกอนุมัติ ล็อก ปลดล็อก ลบ หรือ Archive
- กลุ่มกำลังจะได้สำรวจหรือถูกเปิดเป็น active
- ครูส่ง Observation กลับให้แก้
- ครูยืนยันหรือปฏิเสธ Observation
- Session จบแล้ว

ตัวอย่าง Notification ครู:

- นักเรียน Join Class
- กลุ่มมีสมาชิกครบขั้นต่ำ
- กลุ่มพร้อมให้ตรวจ
- มี Observation ใหม่หรือ Resubmit
- พบพืชชนิดเดียวกันอีกครั้งใน Session
- มีเหตุการณ์ตำแหน่งสำคัญ

RLS ต้องให้ผู้ใช้เห็นและ Mark Read ได้เฉพาะ Notification ของตนเอง

---

## 11. Realtime สำหรับหน้ากลุ่ม

ไม่ควร Refetch ทุก 5 วินาทีเป็นหลัก

ใช้ Flow:

```text
เปิดหน้ากลุ่ม
→ Initial Fetch จาก Database
→ Subscribe private channel class:{classId}:groups
→ มีกลุ่ม/สมาชิก/หัวหน้าเปลี่ยน
→ รับ Realtime Signal
→ Invalidate และ Refetch ข้อมูลจริง
```

Refetch เพิ่มเมื่อ:

- App/Browser กลับมา Foreground
- Internet กลับมา
- Realtime Reconnect
- Mutation สำเร็จหรือล้มเหลว

สามารถมี Fallback Poll ทุก 30–60 วินาทีได้ แต่ไม่จำเป็นถ้า Realtime และ Reconnect ทำงานครบ

Channel ที่ใช้:

```text
class:{classId}:groups
user:{userId}:notifications
```

Event ตัวอย่าง:

```text
group.created
group.deleted
group.archived
group.member_joined
group.member_moved
group.leader_changed
group.invitation_changed
group.formation_changed
notification.created
```

Event เป็นเพียงสัญญาณให้ Refetch ไม่ใช่ข้อมูลที่ใช้ตัดสินสิทธิ์หรือจำนวนกลุ่มโดยตรง

---

## 12. กฎหนึ่งกลุ่ม Active ใน Session

ใน Session เดียวกันมีเพียงหนึ่งกลุ่มที่เป็น `active` ได้ในเวลาเดียวกัน

```sql
create unique index one_active_group_per_session
on exploration_session_groups(session_id)
where status = 'active';
```

กลุ่มที่รอ:

- ดู Route ได้
- ยังส่งตำแหน่งสดไม่ได้
- ยังสร้างหรือ Submit Observation ไม่ได้

การสลับกลุ่มต้องทำผ่าน Transaction/RPC เดียว

---

## 13. Flow การสร้าง Observation

### เริ่ม Observation

ระบบบันทึก:

- ผู้สร้าง
- Class / Activity / Session / Group
- `capture_location`
- `capture_accuracy_m`
- `captured_at`
- `client_generated_id`

ตำแหน่ง Marker ใช้ตำแหน่งตอนถ่าย ไม่ใช้ตำแหน่งตอน Submit

### ภาพ

Observation หนึ่งรายการ:

- อย่างน้อย 1 ภาพ
- สูงสุด 10 ภาพ
- ต้องมีภาพทั้งต้นอย่างน้อย 1 ภาพ

หมวดภาพ:

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

ก่อน Upload:

- แก้ Orientation
- Resize ด้านยาวไม่เกิน 2,048 px
- Compress คุณภาพประมาณ 82–85
- จำกัดไม่เกิน 5 MB ต่อภาพ
- Upload เข้า Private Supabase Storage

---

## 14. Gemini และ Worker

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
→ ส่ง Gemini
→ Validate JSON
→ บันทึกผลแบบ Versioned
→ อัปเดตสถานะ
→ แจ้ง Client
```

เก็บ:

- Provider
- Model
- Prompt Version
- Response Schema Version
- เวลาและสถานะ
- ผลแบบ JSONB

ถ้า Gemini ล้มเหลว:

- Draft ไม่หาย
- Retry ได้
- นักเรียนกรอกเองได้
- นักเรียนใช้ Google Lens หรือแหล่งภายนอกได้

ก่อน Submit นักเรียนยังต้องกรอก:

- ชื่อไทย/ชื่อสามัญ
- ชื่อวิทยาศาสตร์
- เหตุผลหรือหลักฐานสั้น ๆ

ไม่อนุญาตให้ Submit เป็น `Unknown`

---

## 15. นักเรียนตรวจผล Gemini

แต่ละลักษณะเลือกได้:

```text
match
not_match
unsure
not_visible
```

ถ้า `not_match` นักเรียนสามารถกรอกค่าที่ถูกต้องและหมายเหตุ

ต้องเก็บแยก:

- ค่า Gemini
- ผลตรวจนักเรียน
- ค่าที่นักเรียนแก้
- Submission แต่ละ Version
- ผลตรวจและค่าที่ครูแก้

ห้ามเขียนทับข้อมูลเดิม

---

## 16. การตรวจชนิดพืชซ้ำ

ระบบตรวจ Observation ที่ Submit แล้วใน Session เดียวกัน

หากพบชนิดเดียวกัน:

- เตือนนักเรียน
- แสดงรายการที่เกี่ยวข้องตามสิทธิ์
- ยังอนุญาตให้ Submit
- ใส่ Tag `same_species_in_session`
- สร้าง Notification ให้ครู
- แสดง Tag ใน Marker และหน้ารายละเอียด

ต้องแยก:

```text
same_species = ชนิดเดียวกัน
possible_same_specimen = อาจเป็นต้นเดียวกัน
```

การตรวจต้นเดียวกันอาจใช้ชนิดพืช ลักษณะ ภาพ ตำแหน่ง และเวลา ระยะห่างอย่างเดียวไม่พอ และห้ามรวม/ลบ Observation อัตโนมัติ

---

## 17. ครูตรวจ Observation

สถานะหลัก:

```text
draft
→ analysis
→ student_review
→ submitted
→ teacher_review
   ├─ verified
   ├─ revision_required
   ├─ unable_to_verify
   └─ rejected
```

ครูสามารถ:

- ยืนยัน
- แก้ชื่อไทย/ชื่อสามัญ
- แก้ชื่อวิทยาศาสตร์
- แก้ลักษณะพืช
- ส่งกลับให้แก้
- ระบุว่ายืนยันไม่ได้
- ปฏิเสธ

ถ้าส่งกลับ นักเรียนแก้ Observation เดิมและ Resubmit โดยสร้าง Submission Version ใหม่

---

## 18. แผนที่ระหว่างและหลังจบกิจกรรม

Draft ไม่แสดงบนแผนที่ครู

Marker ใช้ตำแหน่งตอนถ่ายและสีตามสถานะ:

```text
submitted / teacher_review = เหลืองอำพัน
revision_required = แดง
resubmitted = น้ำเงิน
verified = เขียว
unable_to_verify = ม่วง
rejected = เทา
```

ต้องมี Icon/ข้อความร่วมกับสีเพื่อ Accessibility

เมื่อกด Marker แสดง:

- ภาพหลักและ Gallery
- ชื่อนักเรียนตามสิทธิ์
- ชื่อไทย/ชื่อสามัญ
- ชื่อวิทยาศาสตร์
- ชื่อที่ครูยืนยัน
- เวลาและ GPS Accuracy
- ผล Gemini
- ผลตรวจ/ค่าที่นักเรียนแก้
- ประวัติการ Submit
- ผลตรวจครู
- Tag ชนิดพืชซ้ำ

หลังครูกดจบ Session ครูและนักเรียนที่เข้าร่วมสามารถเปิดแผนที่ผลลัพธ์และดูรายละเอียดพืชได้

---

## 19. ตารางหลักที่ควรมี

```text
profiles
classes
class_members
class_invites

groups
group_members
group_invitations
student_group_creation_claims
group_membership_history
notifications

activities
activity_routes
activity_boundaries
activity_checkpoints

exploration_sessions
exploration_session_groups
session_participants
location_events

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
audit_logs
```

ใช้ Column ปกติสำหรับ Ownership, Role, Status, Group, Location, Time และข้อมูลที่ Query บ่อย ใช้ `jsonb` สำหรับ Gemini Result, Trait เพิ่มเติม, Snapshot, Notification Context และ Research Event Payload

---

## 20. Security และ RLS

- เปิด RLS ทุก Table ที่ Expose
- Student เห็นเฉพาะ Class ที่เป็นสมาชิก
- Student สร้างกลุ่มผ่าน RPC เท่านั้น
- Leader จัดการได้เฉพาะกลุ่มตนเองและเฉพาะก่อน Lock
- Student เห็น/Mark Read ได้เฉพาะ Notification ของตน
- Teacher จัดการกลุ่มเฉพาะ Class ที่ตนสอน
- Student แก้เฉพาะ Observation ของตนในสถานะที่อนุญาต
- Teacher ตรวจเฉพาะ Observation ใน Class ของตน
- Storage เป็น Private
- Service Role และ Gemini Key ห้ามอยู่ใน Browser
- Realtime Channel ไม่ใช่การ Authorization

---

## 21. RPC สำคัญ

```text
join_class_with_invite(code)
create_student_group(class_id, name, description)
invite_classmate_to_group(group_id, invitee_id)
accept_group_invitation(invitation_id)
decline_group_invitation(invitation_id)
transfer_group_leadership(group_id, new_leader_id)
move_student_between_groups(class_id, student_id, destination_group_id, successor_leader_id)
delete_or_archive_group(group_id, member_handling)
set_group_formation_state(class_id, state)

open_exploration_session(session_id)
activate_session_group(session_id, group_id)
start_observation(...)
queue_observation_analysis(observation_id)
submit_observation(observation_id, expected_version)
request_observation_revision(...)
review_observation(...)
complete_exploration_session(session_id)
```

---

## 22. Acceptance Criteria สำคัญ

ระบบ MVP ถือว่าผ่านเมื่อ:

1. ครูสร้าง Class และตั้งค่ากลุ่มได้
2. นักเรียน Join ด้วย Code/Link/QR โดยไม่ใช้อีเมล
3. นักเรียนสร้างกลุ่มและเป็นหัวหน้าคนเดียว
4. นักเรียนอยู่ได้เพียงหนึ่งกลุ่มต่อ Class
5. การแย่งช่องกลุ่มสุดท้ายทำให้สำเร็จเพียงหนึ่งคน
6. เมื่อกลุ่มครบ ปุ่มสร้างกลุ่ม Disabled พร้อมข้อความ
7. Realtime ทำให้หน้ากลุ่มทุกคนอัปเดตทันที
8. หัวหน้าส่ง Invite และเพื่อนกดยอมรับในแอป
9. ครูย้ายนักเรียน เปลี่ยนหัวหน้า และลบกลุ่มที่ยังไม่ใช้ได้
10. กลุ่มที่มีประวัติถูก Archive ไม่ถูกลบ
11. Session Snapshot ไม่เปลี่ยนตามการย้ายกลุ่มภายหลัง
12. มีเพียงหนึ่งกลุ่ม active ใน Session
13. นักเรียนถ่ายภาพและสร้าง Observation ส่วนบุคคลได้
14. Gemini ทำงานผ่าน Queue และข้อมูลไม่หายเมื่อ Fail
15. นักเรียนตรวจและแก้ผล AI ก่อน Submit
16. ชนิดพืชซ้ำถูกเตือนแต่ยัง Submit ได้และครูได้รับ Notification
17. ครูตรวจ ส่งกลับ และแก้ผลได้โดยไม่เขียนทับประวัติ
18. ครูและนักเรียนดูแผนที่ผลลัพธ์หลังจบ Session ได้

เอกสารนี้มี Requirement เพียงพอสำหรับเริ่มพัฒนา MVP โดยไม่มี Product Flow ที่ Block การเริ่ม Coding เหลืออยู่
