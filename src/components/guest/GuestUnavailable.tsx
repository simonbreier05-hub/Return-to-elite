"use client";

import { GuestLocaleProvider, useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";
import { Glyph } from "@/components/ui/primitives";
import GuestLegalLinks from "./GuestLegalLinks";
import type { GuestLegalLinkUrls } from "@/lib/guestLegalLinks";

/**
 * Shown for every access failure on the guest screen — unknown room code,
 * unknown/expired stay token, or a room with no current stay. Deliberately
 * a single neutral message for all of them (Prompt G2 Teil 2): telling
 * "wrong code" apart from "expired" or "no guest right now" would let
 * someone probing codes/tokens learn something from the difference. No
 * Stay to read a language from here, so this only ever detects from the
 * browser/a prior manual choice, never a stay's own preference.
 */
export default function GuestUnavailable({ legalLinks }: { legalLinks?: GuestLegalLinkUrls }) {
  return (
    <GuestLocaleProvider>
      <GuestUnavailableContent legalLinks={legalLinks} />
    </GuestLocaleProvider>
  );
}

function GuestUnavailableContent({ legalLinks }: { legalLinks?: GuestLegalLinkUrls }) {
  const { t } = useGuestLocale();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="glass w-full max-w-sm px-6 py-8 text-center">
        <span className="glass-disc mx-auto mb-4 flex size-16 items-center justify-center rounded-pill text-text-primary">
          <Glyph name="info" size={30} />
        </span>
        <h1 className="text-title-28 text-text-primary">{t("unavailable.title")}</h1>
        <p className="text-body-16 mt-3 text-text-secondary">{t("unavailable.message")}</p>
      </div>
      {legalLinks && <GuestLegalLinks links={legalLinks} />}
    </main>
  );
}
