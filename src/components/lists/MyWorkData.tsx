"use client";

import { useState } from "react";
import Collapsible from "@/components/Collapsible";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { CATEGORIES, type PersonStats } from "@/lib/workdata/stats";

/** H3: Housekeeper sehen nur ihre eigenen Arbeitsdaten (lädt erst beim Aufklappen). */
export default function MyWorkData() {
  const { t } = useLocale();
  const [s, setS] = useState<PersonStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = (open: boolean) => {
    if (!open || loaded) return;
    setLoaded(true);
    api<{ stats: PersonStats }>("/api/workdata/me").then((d) => setS(d.stats)).catch(() => setS(null));
  };
  return (
    <div className="mt-4">
      <Collapsible summary={<span className="text-sm font-medium">{t("workdata.mine")}</span>} onToggle={load}>
        <div className="px-3 pb-3 text-sm">
          {!s ? <p className="text-graphite/70">{loaded ? t("workdata.tooLittle") : ""}</p> : (
            <>
              <p className="mb-2 text-graphite/80">{t("workdata.basisShort", { n: s.samples, days: s.days })}</p>
              <ul className="space-y-1">
                {CATEGORIES.map((c) => (
                  <li key={c} className="flex justify-between gap-3">
                    <span>{t(`workdata.cat_${c}` as TKey)}</span>
                    <span className="text-graphite/80">{s.byCategory[c].enough ? `${s.byCategory[c].median} min` : t("workdata.tooLittle")}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Collapsible>
    </div>
  );
}
