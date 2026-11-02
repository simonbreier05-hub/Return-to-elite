import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { styleguideEnabled } from "@/lib/ui/styleguideAccess";
import StyleguideView from "./StyleguideView";

// Zur Laufzeit prüfen (ENABLE_STYLEGUIDE kann am Preview-Service ohne neuen Build gesetzt werden).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Styleguide · StayClean",
  robots: { index: false, follow: false },
};

/** Styleguide „Glas & Premium“ (D0): alle Token, Schriften und Bausteine mit allen Zuständen. Nur Testdaten. */
export default function StyleguidePage() {
  if (!styleguideEnabled({ NODE_ENV: process.env.NODE_ENV, ENABLE_STYLEGUIDE: process.env.ENABLE_STYLEGUIDE })) notFound();
  return <StyleguideView backHref="/" />;
}
