"use client";

import { IconBan, IconBroom, IconClock, IconLaundry, IconMoon, IconSuitcase, IconWrench } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleContext";

/** Legende der Zimmerzeilen: jedes Symbol mit Wort (nie nur Farbe). */
export default function RowLegend() {
  const { t } = useLocale();
  const item = (icon: React.ReactNode, label: string) => <li className="flex min-h-8 items-center gap-1.5">{icon}<span>{label}</span></li>;
  const ic = "h-4 w-4 shrink-0";
  return (
    <details className="mb-3 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">{t("lists.legendTitle")}</summary>
      <div className="border-t border-border-subtle px-3 py-2">
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {item(<IconBroom className={ic} />, t("lists.kindDEPARTURE"))}
          {item(<IconClock className={ic} />, t("lists.kindSAME_DAY_TURN"))}
          {item(<IconMoon className={ic} />, t("lists.kindSTAYOVER"))}
          {item(<IconSuitcase className={ic} />, t("lists.kindARRIVAL"))}
          {item(<IconLaundry className={ic} />, t("lists.laundry"))}
          {item(<span aria-hidden>★</span>, t("lists.vip"))}
          {item(<IconBan className={ic} />, t("lists.dnd"))}
          {item(<IconWrench className={ic} />, t("lists.rowDefects", { n: "n" }))}
          {item(<span aria-hidden>✨</span>, t("lists.wishCLEAN_REQUEST"))}
          {item(<span aria-hidden>💬</span>, t("lists.wishCONTACT"))}
          {item(<span aria-hidden>▸</span>, t("lists.rowTraces", { n: "n" }))}
          {item(<span aria-hidden>📌</span>, t("lists.precheckNoted"))}
          {item(<span aria-hidden>🔎</span>, t("lists.precheckArrival"))}
        </ul>
        <p className="mt-1 text-xs text-text-secondary">{t("lists.legendStatus")}. {t("lists.legendNotes")}</p>
      </div>
    </details>
  );
}
