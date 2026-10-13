import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "录屏转 GIF",
  description: "在浏览器本地把录屏截取、裁剪并导出为 GIF 或静音 MP4。Trim, crop and export screen recordings as GIF or silent MP4, locally in your browser.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
