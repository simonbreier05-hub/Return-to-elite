import { requirePage } from "@/lib/pageGuard";
import GuestAccessPrintView from "./view";

/**
 * Printable QR sheet (Prompt G2 Teil 2: "druckbares PDF, Zimmernummer im
 * Klartext für das Personal"). No AppShell — this is meant to be printed
 * (or saved as PDF via the browser's Print dialog), not browsed.
 */
export default async function GuestAccessPrintPage() {
  await requirePage(["supervisor"]);
  return <GuestAccessPrintView />;
}
