import {
  ArrowRight,
  CheckCircle2,
  Leaf,
  LockKeyhole,
  Radio,
  WifiOff,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const foundations = [
  {
    icon: LockKeyhole,
    title: "ขอบเขตข้อมูลปลอดภัย",
    detail:
      "แยก Supabase ฝั่งเบราว์เซอร์และเซิร์ฟเวอร์ พร้อมตรวจค่าระบบโดยไม่เปิดเผยคีย์ลับ",
  },
  {
    icon: Radio,
    title: "พร้อมสำหรับข้อมูลสด",
    detail:
      "วางฐาน TanStack Query และ Supabase Realtime สำหรับการรีเฟตช์ข้อมูลจริงอย่างถูกต้อง",
  },
  {
    icon: WifiOff,
    title: "ออกแบบเพื่อภาคสนาม",
    detail:
      "โครงสร้างโมดูลรองรับสถานะออฟไลน์ การลองใหม่ และหน้าจอมือถือ 360–430 พิกเซล",
  },
] as const;

export default function Home() {
  return (
    <main className="bg-background min-h-dvh overflow-hidden">
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="border-border/80 flex items-center justify-between border-b py-3">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-full">
              <Leaf aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight">AI Escort</p>
              <p className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.16em] uppercase">
                Field learning
              </p>
            </div>
          </div>
          <span className="border-success/30 bg-success/10 text-success rounded-full border px-3 py-1.5 text-xs font-semibold">
            Foundation · Phase 0
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.08fr_0.92fr] lg:py-20">
          <div>
            <p className="text-primary mb-5 font-mono text-xs font-medium tracking-[0.18em] uppercase">
              สำรวจ · ตรวจสอบ · เรียนรู้
            </p>
            <h1 className="text-foreground max-w-3xl text-4xl leading-[1.16] font-bold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
              เปลี่ยนการสำรวจพืช
              <span className="text-primary block font-serif font-normal italic">
                ให้เป็นหลักฐานการเรียนรู้
              </span>
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-7 text-pretty sm:text-lg sm:leading-8">
              ระบบมือถือสำหรับครูและนักเรียน บันทึกพืชในพื้นที่จริง ใช้ AI
              เป็นข้อเสนอเบื้องต้น และเก็บคำตัดสินสุดท้ายไว้กับครูเสมอ
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                className={cn(buttonVariants({ size: "lg" }))}
                href="/auth/sign-in"
              >
                เข้าสู่ระบบ
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
              <a
                className={buttonVariants({ variant: "outline", size: "lg" })}
                href="/api/health/live"
              >
                ตรวจสถานะระบบ
              </a>
            </div>

            <div className="text-muted-foreground mt-8 flex items-center gap-2 text-sm">
              <CheckCircle2
                aria-hidden="true"
                className="text-success size-4"
              />
              <span>โครงสร้างพร้อมพัฒนาฟีเจอร์แนวตั้งอย่างปลอดภัย</span>
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="bg-primary/8 absolute -inset-10 -z-10 rounded-full blur-3xl"
            />
            <div className="border-border bg-card rounded-[2rem] border p-3 shadow-[0_24px_80px_rgba(20,71,47,0.12)]">
              <div className="bg-forest text-primary-foreground rounded-[1.5rem] px-5 py-6 sm:px-7">
                <p className="text-mint font-mono text-[0.68rem] tracking-[0.16em] uppercase">
                  Build readiness
                </p>
                <h2 className="mt-2 text-2xl font-semibold">ฐานระบบระยะแรก</h2>
                <p className="text-primary-foreground/70 mt-2 text-sm leading-6">
                  ทุกชั้นของระบบมีขอบเขตชัดเจนก่อนเริ่มข้อมูลจริง
                </p>
              </div>
              <div className="grid gap-2 p-2 pt-3">
                {foundations.map(({ icon: Icon, title, detail }) => (
                  <article
                    className="hover:border-border hover:bg-muted/60 grid grid-cols-[2.75rem_1fr] gap-3 rounded-2xl border border-transparent p-3 transition-colors"
                    key={title}
                  >
                    <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-foreground text-sm font-semibold">
                        {title}
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm leading-6">
                        {detail}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="border-border/80 text-muted-foreground flex flex-col gap-2 border-t py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>AI ช่วยเสนอ · นักเรียนตรวจสอบ · ครูเป็นผู้ตัดสิน</span>
          <span className="font-mono">TH · Asia/Bangkok · Mobile first</span>
        </footer>
      </div>
    </main>
  );
}
