/** Fokus-Hilfen für Fenster: Fokus im Fenster halten (Tab/Shift+Tab) und danach zurückgeben. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("inert") && el.getClientRects().length > 0);
}

/** Tab am Ende springt an den Anfang und umgekehrt. Gibt true zurück, wenn der Schritt abgefangen wurde. */
export function trapTab(root: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== "Tab") return false;
  const items = focusables(root);
  if (items.length === 0) {
    e.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !root.contains(active))) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
