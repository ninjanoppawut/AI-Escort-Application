import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Escort",
    template: "%s · AI Escort",
  },
  description:
    "ระบบสำรวจพรรณไม้ภาคสนามสำหรับโรงเรียน พร้อม AI ช่วยวิเคราะห์และครูตรวจสอบ",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#14472f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
