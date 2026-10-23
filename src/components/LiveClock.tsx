"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

/** Live-Uhr mit Datum im Kopfbereich (Hotelzeit Berlin). Erst nach dem Mounten gerendert, damit Server und Browser nicht auseinanderlaufen. */
export default function LiveClock({ tone = "shell" }: { tone?: "shell" | "pl" }) {
  const { locale } = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return tone === "pl" ? <span className="inline-block h-4 w-44" aria-hidden /> :  <div className="h-10 w-16 md:hidden lg:block lg:w-40" aria-hidden />;
  const tag = locale === "de" ? "de-DE" : "en-GB";
  const time = now.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" });
  const date = now.toLocaleDateString(tag, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  if (tone === "pl") {
    // kurz (TT.MM.), damit es mobil in die Kopfzeile passt
    const short = now.toLocaleDateString(tag, { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
    return <span role="timer" aria-label={`${date}, ${time}`} className="tabular-nums">{short} · {time}</span>;
  }
  return (
    <div className="flex shrink-0 flex-col items-end leading-tight text-charcoal/85 md:hidden lg:flex" role="timer" aria-label={`${date}, ${time}`}>
      <span className="font-serif text-base tabular-nums text-navy">{time}</span>
      <span className="hidden text-[0.65rem] uppercase tracking-wider text-charcoal/60 lg:block">{date}</span>
    </div>
  );
}
