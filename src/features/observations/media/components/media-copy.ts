import {
  MAX_IMAGES_PER_OBSERVATION,
  MEDIA_CATEGORY_LABELS,
  type MediaCategory,
} from "../contracts";
import { isMediaUiErrorCode, mediaErrorPresentation } from "../errors";
import type { UploadErrorCode, UploadQueueEvent } from "../client/upload-queue";

/** Thai-first copy for the evidence-image section (UI_CONTRACTS.md §5). */
export const MEDIA_COPY = {
  title: "ภาพหลักฐาน",
  count: (used: number, max: number = MAX_IMAGES_PER_OBSERVATION) =>
    `${used} จาก ${max}`,
  wholePlantMissing: "ต้องมีภาพทั้งต้นอย่างน้อย 1 ภาพ",
  wholePlantPresent: "มีภาพทั้งต้นแล้ว",
  camera: "ถ่ายภาพ",
  gallery: "เลือกจากคลัง",
  fullReason: "ครบ 10 ภาพแล้ว — ลบภาพที่ไม่ต้องการก่อนเพิ่มภาพใหม่",
  blockedPrefix: "เพิ่มหรือลบภาพไม่ได้",
  blockedFallback: "ร่างนี้แก้ไขไม่ได้แล้ว",
  listLoadingReason: "กำลังโหลดรายการภาพ...",
  listFailedReason: "โหลดรายการภาพก่อน จึงจะเพิ่มภาพได้",
  listFailedTitle: "โหลดรายการภาพไม่สำเร็จ",
  listFailedHint: "ตรวจสอบสัญญาณแล้วลองอีกครั้ง ภาพที่กำลังส่งยังอยู่ในหน้านี้",
  reloadList: "โหลดภาพอีกครั้ง",
  offlineTitle: "ออฟไลน์อยู่",
  offlineBody: "ภาพจะรอส่ง แล้วระบบจะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์",
  unsentWarning:
    "ภาพที่ยังไม่ส่งเก็บไว้ในเครื่องนี้แล้ว · เปิดหน้านี้อีกครั้งเพื่อส่งต่อ",
  progress: (current: number, total: number) =>
    `กำลังส่งภาพ ${current} จาก ${total}`,
  waitingProgress: (count: number) => `รอส่ง ${count} ภาพ`,
  retryAll: "ลองใหม่ทั้งหมด",
  emptyTitle: "ยังไม่มีภาพ",
  emptyHint: "เริ่มจากถ่ายภาพทั้งต้น แล้วค่อยถ่ายใบ ดอก หรือผล",
  tile: {
    processing: "กำลังประมวลผล",
    needsCategory: "เลือกประเภท",
    waiting: "รอส่ง",
    uploading: (percent: number) => `กำลังอัปโหลด ${percent}%`,
    uploaded: "อัปโหลดแล้ว",
    failed: "ส่งภาพนี้ไม่สำเร็จ — แตะเพื่อลองใหม่",
    autoRetry: "ระบบจะลองใหม่ให้อัตโนมัติ",
    deleting: "กำลังลบ",
    cancelling: "กำลังยกเลิก",
    retake: "ต้องถ่ายใหม่",
    rejected: "ใช้ภาพนี้ไม่ได้",
    blocked: "ส่งไม่ได้",
    imageFailed: "โหลดภาพไม่สำเร็จ",
  },
  imageAlt: (index: number, category: MediaCategory | null) =>
    category
      ? `ภาพที่ ${index} · ${MEDIA_CATEGORY_LABELS[category]}`
      : `ภาพที่ ${index} · ยังไม่เลือกประเภท`,
  panel: {
    close: "ปิด",
    categoryLegend: "ประเภทของภาพนี้",
    needsCategoryHint: "เลือกว่าภาพนี้เป็นส่วนไหนของต้น แล้วกดส่ง",
    send: "ส่งภาพนี้",
    saveCategory: "บันทึกประเภท",
    categoryLocked: "เปลี่ยนประเภทได้เมื่อส่งภาพนี้เสร็จ",
    retry: "ลองใหม่",
    retryNow: "ลองใหม่ตอนนี้",
    cancel: "ยกเลิกภาพนี้",
    dismiss: "นำภาพนี้ออก",
    delete: "ลบภาพ",
    retryDelete: "ลองลบอีกครั้ง",
    lastWholePlant: "ลบภาพทั้งต้นภาพสุดท้ายไม่ได้ — เพิ่มภาพทั้งต้นใหม่ก่อน",
    retakeBody:
      "ภาพนี้ส่งไม่ครบ และไฟล์ในเครื่องหายไปแล้ว (เช่น หลังรีเฟรชหน้า) — ลบแล้วถ่ายใหม่",
    deletingBody: "ระบบกำลังลบภาพนี้ ถ้าค้างนาน ลองลบอีกครั้ง",
    processingBody: "กำลังหมุน ย่อ และบีบอัดภาพในเครื่อง",
    uploadingBody: "กำลังส่งภาพนี้",
    waitingBody: "ภาพนี้รอส่งตามคิว",
    waitingOfflineBody: "ภาพนี้รอส่งเมื่อกลับมาออนไลน์",
    uploadedBody: "ส่งภาพนี้แล้ว เห็นเฉพาะคุณจนกว่าจะส่งการสังเกต",
    cancellingBody: "กำลังยกเลิกภาพนี้",
  },
  deleteDialog: {
    title: "ลบภาพนี้?",
    body: (index: number, category: MediaCategory | null) =>
      `ภาพที่ ${index}${category ? ` (${MEDIA_CATEGORY_LABELS[category]})` : ""} จะถูกลบออกจากการสังเกตนี้ และกู้คืนไม่ได้`,
    confirm: "ลบภาพ",
    keep: "ไม่ลบ",
  },
  cameraDenied: {
    title: "ไม่ได้รับสิทธิ์กล้อง",
    description:
      "เปิดสิทธิ์กล้องให้เว็บนี้เพื่อถ่ายภาพ หรือใช้ “เลือกจากคลัง” ได้เลย",
    steps: [
      "Chrome (Android): แตะไอคอนหน้าช่องที่อยู่เว็บ › สิทธิ์ › กล้อง › อนุญาต",
      "Safari (iPhone): การตั้งค่า › Safari › กล้อง › อนุญาต",
    ],
  },
  capped: (picked: number, added: number) =>
    `เลือกมา ${picked} ภาพ แต่เพิ่มได้อีก ${added} ภาพ — เพิ่ม ${added} ภาพแรกแล้ว`,
  announce: {
    uploaded: (category: MediaCategory) =>
      `ส่งภาพ${MEDIA_CATEGORY_LABELS[category]}แล้ว`,
    retrying: "ส่งภาพไม่สำเร็จ เพราะสัญญาณขาด — ระบบจะลองใหม่ให้อัตโนมัติ",
    failed: "ส่งภาพไม่สำเร็จ — แตะภาพเพื่อลองใหม่",
    removed: "ยกเลิกภาพแล้ว",
    deleted: "ลบภาพแล้ว",
    deleting: "ระบบยังลบภาพไม่เสร็จ — ลองลบอีกครั้ง",
    categoryUpdated: (category: MediaCategory) =>
      `เปลี่ยนเป็นภาพ${MEDIA_CATEGORY_LABELS[category]}แล้ว`,
  },
} as const;

export interface ErrorPresentation {
  title: string;
  description: string;
  action: string;
}

/** Cause and way out for one image failure, in plain Thai. */
export function uploadErrorPresentation(
  code: UploadErrorCode,
  autoRetry = false,
): ErrorPresentation {
  if (code === "NETWORK") {
    return autoRetry
      ? {
          title: "ส่งไม่สำเร็จ เพราะสัญญาณขาด",
          description: "ระบบจะลองใหม่ให้อัตโนมัติ ภาพยังอยู่ในเครื่อง",
          action: MEDIA_COPY.panel.retryNow,
        }
      : {
          title: "ส่งไม่สำเร็จ เพราะสัญญาณขาด",
          description:
            "ระบบลองหลายครั้งแล้ว แตะ “ลองใหม่” เมื่อสัญญาณดีขึ้น ภาพยังอยู่ในเครื่อง",
          action: MEDIA_COPY.panel.retry,
        };
  }
  if (code === "IMAGE_PROCESSING_FAILED") {
    return {
      title: "ประมวลผลรูปไม่สำเร็จ",
      description: "ลองเลือกรูปอีกครั้ง",
      action: "เลือกรูปใหม่",
    };
  }
  return isMediaUiErrorCode(code)
    ? mediaErrorPresentation(code)
    : mediaErrorPresentation("FORBIDDEN");
}

/** The polite live-region text for a queue event, if any. */
export function announcementFor(event: UploadQueueEvent): string | null {
  switch (event.type) {
    case "uploaded":
      return MEDIA_COPY.announce.uploaded(event.category);
    case "retrying":
      return event.code === "NETWORK"
        ? MEDIA_COPY.announce.retrying
        : uploadErrorPresentation(event.code, true).title;
    case "failed":
      return event.code === "NETWORK"
        ? MEDIA_COPY.announce.failed
        : uploadErrorPresentation(event.code).title;
    case "blocked":
    case "rejected":
      return uploadErrorPresentation(event.code).title;
    case "removed":
      return MEDIA_COPY.announce.removed;
  }
}
