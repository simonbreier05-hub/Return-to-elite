import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Noto_Sans_Devanagari, Vazirmatn } from "next/font/google";
import Script from "next/script";
import Providers from "@/components/Providers";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font at build time — no request leaves the
 * browser at runtime, which also keeps the app usable on a hotel's locked-down
 * staff wifi.
 */
/*
 * Zeichensätze (Prompt K1): Design-Schriften mit allen Zeichensätzen, die sie haben (Vietnamesisch = latin-ext +
 * vietnamese, dazu Kyrillisch/Griechisch für maschinell übersetzte Sprachen). Für Schriften, die sie nicht abdecken,
 * springen Noto Sans Devanagari (Hindi) und Vazirmatn (Persisch/Arabisch) ein — ohne Preload; der Browser lädt sie
 * per unicode-range nur, wenn solche Zeichen wirklich vorkommen. Alles andere (Thai, CJK …) kommt aus den Systemschriften.
 */
const serif = Cormorant_Garamond({
  subsets: ["latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "greek-ext"],
  variable: "--font-body",
  display: "swap",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-deva",
  display: "swap",
  preload: false,
});

const arabic = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "StayClean",
  description: "Real-time room cleaning & release for Hotel de Rome, Berlin",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#133457",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" dir="ltr" className={`${serif.variable} ${sans.variable} ${devanagari.variable} ${arabic.variable}`}>
      <body className="min-h-screen bg-ivory text-charcoal antialiased">
        <Providers>{children}</Providers>
        {/* Registers the static-asset service worker (public/sw.js) after
            the page is interactive. The Socket.IO connection and all
            /api/** calls stay online-only — see public/sw.js for scope. */}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                  console.error('[sw] registration failed:', err);
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
