"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { hhmm } from "@/lib/i18n/format";

/** Hinweis nach der Nachtlöschung: seit dem letzten Import wurden die Gastdaten gelöscht → Listen neu importieren. */
export default function PurgeBanner({ refreshKey }: { refreshKey?: string }) {
  const { t } = useLocale();
  const [info, setInfo] = useState<{ importsPurged: boolean; lastOkAt: string | null } | null>(null);
  useEffect(() => {
    api<{ importsPurged: boolean; lastOkAt: string | null }>("/api/guest-data/purge-status").then(setInfo).catch(() => {});
  }, [refreshKey]);
  if (!info?.importsPurged || !info.lastOkAt) return null;
  const time = hhmm(info.lastOkAt);
  return (
    <div className="mb-4 rounded-xl border border-gold-line bg-parchment p-3 text-sm" role="status">
      {t("purge.banner", { time })}
    </div>
  );
}
