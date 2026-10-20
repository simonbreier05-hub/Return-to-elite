"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

/** Live-Uhr mit Datum im Kopfbereich (Hotelzeit Berlin). Erst nach dem Mounten gerendert, damit Server und Browser nicht auseinanderlaufen. */
export default function LiveClock() {
  const { locale } = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <div className="h-10 w-16 sm:w-40" aria-hidden />;
  const tag = locale === "de" ? "de-DE" : "en-GB";
  const time = now.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" });
  const date = now.toLocaleDateString(tag, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  return (
    <div className="flex shrink-0 flex-col items-end leading-tight text-charcoal/85" role="timer" aria-label={`${date}, ${time}`}>
      <span className="font-serif text-base tabular-nums text-navy">{time}</span>
      <span className="hidden text-[0.65rem] uppercase tracking-wider text-charcoal/60 sm:block">{date}</span>
    </div>
  );
}
