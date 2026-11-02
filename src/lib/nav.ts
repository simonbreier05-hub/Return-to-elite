/**
 * Zentrale Menü-Konfiguration je Rolle (Design D1, docs/design/glass-spec.md Abschnitt 10).
 *
 * Eine Quelle für Seitenleiste (≥ 1280 px), Icon-Leiste (640–1279 px) und Tab-Leiste (< 640 px).
 * Nur Routen, die es im Bestand gibt und die die Rolle öffnen darf (`requirePage` der Seite) —
 * Rechte werden hier NICHT vergeben, nur angezeigt. Punkte der Spezifikation ohne Route fehlen
 * bewusst (siehe MISSING_IN_STOCK).
 *
 * `mobileRank`: Reihenfolge fürs Handy. Höchstens vier Punkte in der Tab-Leiste; hat eine Rolle
 * mehr als vier, zeigt die Leiste die ersten drei + „Mehr“ (Sheet mit dem Rest).
 */
import type { Role } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";
import type { IconName } from "@/lib/ui/icons";

/** Woher ein Zähler-Badge kommt — nur bestehende Datenquellen (keine neuen API-Routen). */
export type NavCountSource = "chat";

export interface NavEntry {
  id: string;
  labelKey: TKey;
  icon: IconName;
  href: string;
  count?: NavCountSource;
  mobileRank: number;
}

export const MAX_TABS = 4;

const messages = (rank: number): NavEntry => ({ id: "messages", labelKey: "nav.messages", icon: "message", href: "/chat", count: "chat", mobileRank: rank });
const floorPlan = (rank: number, labelKey: TKey = "appShell.floorPlan"): NavEntry => ({ id: "floorPlan", labelKey, icon: "bed-single", href: "/floor-plan", mobileRank: rank });

export const NAV: Record<Role, NavEntry[]> = {
  room_attendant: [
    { id: "overview", labelKey: "nav.overview", icon: "home", href: "/attendant", mobileRank: 1 },
    messages(2),
    floorPlan(3),
  ],
  supervisor: [
    { id: "overview", labelKey: "nav.overview", icon: "home", href: "/supervisor", mobileRank: 1 },
    { id: "planning", labelKey: "nav.planning", icon: "calendar-days", href: "/planung", mobileRank: 2 },
    { id: "rooms", labelKey: "nav.rooms", icon: "bed-single", href: "/supervisor/service", mobileRank: 3 },
    messages(4),
    { id: "floorPlan", labelKey: "appShell.floorPlan", icon: "list", href: "/floor-plan", mobileRank: 5 },
    { id: "handover", labelKey: "nav.handover", icon: "file-text", href: "/supervisor/handover", mobileRank: 6 },
    { id: "guestRequests", labelKey: "nav.guestRequests", icon: "bell", href: "/supervisor/guest-requests", mobileRank: 7 },
    { id: "guestAccess", labelKey: "nav.guestAccess", icon: "users", href: "/supervisor/guest-access", mobileRank: 8 },
    { id: "workdata", labelKey: "nav.workdata", icon: "chart", href: "/supervisor/workdata", mobileRank: 9 },
  ],
  duty_manager: [
    { id: "house", labelKey: "nav.house", icon: "home", href: "/duty-manager", mobileRank: 1 },
    { id: "planning", labelKey: "nav.planning", icon: "calendar-days", href: "/planung", mobileRank: 2 },
    floorPlan(3, "nav.rooms"),
    messages(4),
    { id: "settings", labelKey: "nav.settings", icon: "wrench", href: "/settings", mobileRank: 5 },
  ],
  engineering: [
    { id: "workOrders", labelKey: "nav.workOrders", icon: "wrench", href: "/engineering", mobileRank: 1 },
    floorPlan(2, "nav.rooms"),
    messages(3),
  ],
  houseman: [
    { id: "tasks", labelKey: "nav.tasks", icon: "list", href: "/houseman", mobileRank: 1 },
    messages(2),
  ],
  front_office: [
    { id: "arrivals", labelKey: "nav.arrivals", icon: "log-in", href: "/front-office", mobileRank: 1 },
    floorPlan(2, "nav.rooms"),
    messages(3),
  ],
  concierge: [
    { id: "excursions", labelKey: "nav.excursions", icon: "star", href: "/concierge", mobileRank: 1 },
    floorPlan(2, "nav.rooms"),
    messages(3),
  ],
};

/**
 * Punkte aus Abschnitt 10 der Spezifikation, für die es im Bestand keine eigene Route gibt
 * (Funktion steckt in der Startseite oder fehlt). Für den Bericht und den Test.
 */
export const MISSING_IN_STOCK: Partial<Record<Role, string[]>> = {
  room_attendant: ["Aufgaben (in /attendant enthalten)", "Mängel (Meldung als Fenster in /attendant)"],
  supervisor: ["Aufgaben", "Team"],
  duty_manager: ["Berichte", "Team"],
  houseman: ["Mangel melden"],
  concierge: ["Anreisen (/front-office nur für Front Office freigegeben)"],
};

export function navFor(role: string): NavEntry[] {
  return NAV[role as Role] ?? [];
}

/** Tab-Leiste (Handy): bis zu vier Einträge; bei mehr als vier die ersten drei, der Rest kommt unter „Mehr“. */
export function tabsFor(role: string): { tabs: NavEntry[]; more: NavEntry[] } {
  const sorted = [...navFor(role)].sort((a, b) => a.mobileRank - b.mobileRank);
  if (sorted.length <= MAX_TABS) return { tabs: sorted, more: [] };
  return { tabs: sorted.slice(0, MAX_TABS - 1), more: sorted.slice(MAX_TABS - 1) };
}

/** Aktiver Menüpunkt: längster passender Pfad-Anfang (Unterseiten zählen zum Eltern-Punkt). */
export function activeEntryId(role: string, pathname: string): string | null {
  let best: NavEntry | null = null;
  for (const e of navFor(role)) {
    if (pathname === e.href || pathname.startsWith(`${e.href}/`)) {
      if (!best || e.href.length > best.href.length) best = e;
    }
  }
  return best?.id ?? null;
}
