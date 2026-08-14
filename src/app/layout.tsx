import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elite Housekeeping",
  description: "Real-time room cleaning & release for a 145-room luxury hotel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ivory text-charcoal antialiased">{children}</body>
    </html>
  );
}
