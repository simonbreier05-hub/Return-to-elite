import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "StayClean — Ihr Zimmer",
};

/**
 * Guest area root layout (route group `/g/...`) — strictly separate from
 * the staff Hub: no AppShell, no session, no staff navigation. D6 „Glas &
 * Premium“: `.theme-glass` + atmosphere background live here once, so every
 * /g/* page (incl. "not available") gets them. Fonts: the glass classes only
 * use SC Lora 700 + SC Inter 400/500 (self-hosted, src/styles/glass-fonts.css).
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-glass bg-atmosphere min-h-dvh text-text-primary">{children}</div>;
}
