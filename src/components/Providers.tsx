"use client";

import { LocaleProvider } from "@/lib/i18n/LocaleContext";

/** Client-boundary wrapper for app-wide providers, kept out of layout.tsx so
 * the root layout itself can stay a server component. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
