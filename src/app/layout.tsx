import type { Metadata, Viewport } from "next";
import { APP } from "@/config/app";
import { body, display } from "./fonts";
import "./globals.css";
import "./pages.css";

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1aa6b8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
