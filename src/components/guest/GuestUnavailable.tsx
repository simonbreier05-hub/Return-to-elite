"use client";

import { GuestLocaleProvider, useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/**
 * Shown for every access failure on the guest screen — unknown room code,
 * unknown/expired stay token, or a room with no current stay. Deliberately
 * a single neutral message for all of them (Prompt G2 Teil 2): telling
 * "wrong code" apart from "expired" or "no guest right now" would let
 * someone probing codes/tokens learn something from the difference. No
 * Stay to read a language from here, so this only ever detects from the
 * browser/a prior manual choice, never a stay's own preference.
 */
export default function GuestUnavailable() {
  return (
    <GuestLocaleProvider>
      <GuestUnavailableContent />
    </GuestLocaleProvider>
  );
}

function GuestUnavailableContent() {
  const { t } = useGuestLocale();
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div
        className="w-full max-w-sm rounded-2xl border px-6 py-8 text-center shadow-sm"
        style={{ borderColor: "var(--g-panel)", background: "white" }}
      >
        <img src="/guest/hotel-crest.svg" alt="" className="mx-auto mb-4 h-10 w-10" />
        <h1 className="font-serif text-2xl" style={{ color: "var(--g-navy)" }}>
          {t("unavailable.title")}
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--g-muted)" }}>
          {t("unavailable.message")}
        </p>
      </div>
    </div>
  );
}
