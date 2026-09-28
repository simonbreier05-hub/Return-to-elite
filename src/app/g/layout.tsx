import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "StayClean — Ihr Zimmer",
};

/**
 * Guest area root layout (route group `/g/...`) — strictly separate from
 * the staff Hub: no AppShell, no session, no staff navigation. Every
 * /g/* page renders inside this, so the guest theme + background live
 * here once instead of being repeated per page.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="guest-theme min-h-screen" style={{ background: "var(--g-cream)" }}>
      {children}
    </div>
  );
}
