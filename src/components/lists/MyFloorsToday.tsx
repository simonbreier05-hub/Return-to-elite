"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";

/** Eigene Etagen heute (live) — für die alte Zeile und den Glas-Hub (D2). */
export function useMyFloors(): number[] {
  const [floors, setFloors] = useState<number[]>([]);
  const load = useCallback(() => { api<{ floors: number[] }>("/api/me/floors").then((d) => setFloors(d.floors)).catch(() => setFloors([])); }, []);
  useEffect(load, [load]);
  useSocket({ "user:floors": () => load(), "app:resync": () => load() });
  return floors;
}

/** H1: „Deine Etage heute" — nur die eigenen Etagen, live über `user:floors`. Ohne Zuweisung nichts. */
export default function MyFloorsToday() {
  const { t } = useLocale();
  const floors = useMyFloors();
  if (!floors.length) return null;
  return <p className="mb-3 text-sm text-graphite/80"><span aria-hidden>▦ </span>{t("lists.myFloors", { list: floors.join(", ") })}</p>;
}
