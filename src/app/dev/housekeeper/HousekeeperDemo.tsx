"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { RoomStatus } from "@/lib/domain";
import { hkGroupOf } from "@/lib/rooms/hkGroups";
import { hkKpis, withoutLeadingSymbol as plain, type HkRoomView } from "@/lib/ui/hkHub";
import { Button } from "@/components/ui";
import { DetailContainer } from "@/components/shell/DetailContainer";
import { HkHub, type HkListItem } from "@/components/hk/HkHub";
import { HkRoomDetail, TextAction } from "@/components/hk/HkRoomDetail";

/** Erfundene Testdaten wie im Figma-Entwurf (keine echten Gäste, kein Alter). */
type Demo = { id: string; number: string; status: RoomStatus; kind: HkRoomView["kind"]; guest: string; lang: string; pax: number; eta?: string; early?: boolean; vip?: boolean; laundry?: boolean; dnd?: boolean };
const ROOMS: Demo[] = [
  { id: "d305", number: "305", status: "DIRTY", kind: "SAME_DAY_TURN", guest: "Herr Carter", lang: "en", pax: 1, eta: "14:00", early: true },
  { id: "d307", number: "307", status: "IN_PROGRESS", kind: "STAYOVER", guest: "Frau Dubois", lang: "fr", pax: 2, laundry: true },
  { id: "d308", number: "308", status: "DIRTY", kind: "SAME_DAY_TURN", guest: "Herr Tan", lang: "en", pax: 1, dnd: true },
  { id: "d310", number: "310", status: "CLEAN", kind: "STAYOVER", guest: "Frau Müller", lang: "de", pax: 2 },
  { id: "d312", number: "312", status: "DIRTY", kind: "STAYOVER", guest: "Herr Dr. Krüger", lang: "de", pax: 2, eta: "14:00", early: true, vip: true },
  { id: "d314", number: "314", status: "DIRTY", kind: "DEPARTURE", guest: "Frau Okafor", lang: "en", pax: 1 },
  { id: "d316", number: "316", status: "INSPECTED", kind: "SAME_DAY_TURN", guest: "Herr Rossi", lang: "it", pax: 2 },
  { id: "d318", number: "318", status: "DIRTY", kind: "STAYOVER", guest: "Frau Weber", lang: "de", pax: 1 },
];
const TRACES = ["Bett komplett neu beziehen", "Bad vollständig reinigen", "Minibar prüfen & auffüllen", "Zusätzliche Kissen bereitstellen"];

const view = (r: Demo): HkRoomView => ({
  id: r.id, number: r.number, status: r.status, kind: r.kind, vip: !!r.vip, laundry: !!r.laundry, dnd: !!r.dnd,
  paused: false, defects: 0, eta: r.eta ?? null, early: !!r.early, urgent: !!r.early,
});

export default function HousekeeperDemo({ detail, empty, allDone }: { detail: boolean; empty: boolean; allDone: boolean }) {
  const { t } = useLocale();
  const rooms = empty ? [] : allDone ? ROOMS.map((r) => ({ ...r, status: "CLEAN" as RoomStatus })) : ROOMS;
  const [selected, setSelected] = useState<string | null>(detail && !empty ? "d305" : null);
  const order = ["NOW", "NEXT", "DONE", "OTHER"] as const;
  const items: HkListItem[] = order.flatMap((g) =>
    rooms.filter((r) => hkGroupOf(r.status) === g).map((r) => ({ view: view(r), group: g, guest: r.guest, lang: r.lang, pax: r.pax })),
  );
  const done = rooms.filter((r) => hkGroupOf(r.status) === "DONE").length;
  const progress = { done, total: rooms.length, creditsDone: done, creditsTotal: rooms.length };
  const room = rooms.find((r) => r.id === selected) ?? null;

  const panel = (
    <DetailContainer
      className="xl:max-h-[calc(100dvh-17rem)]"
      open={!!room}
      onClose={() => setSelected(null)}
      title={room ? t("hkHub.roomTitle", { n: room.number }) : ""}
      footer={room && hkGroupOf(room.status) === "NEXT" && !room.dnd ? <Button icon="play" block>{plain(t("attendant.startCleaning"))}</Button> : undefined}
    >
      {room && (
        <HkRoomDetail
          data={{
            view: view(room), statusKey: `status.${room.status}` as TKey, guest: room.guest, lang: room.lang, pax: room.pax,
            traces: TRACES.map((text, i) => ({ id: `t${i}`, text, status: "OPEN" })), hints: [], defects: [], guestRequests: [],
          }}
          actions={
            <>
              <TextAction icon="moon" onClick={() => {}}>{plain(t("attendant.blockedAction"))}</TextAction>
              <TextAction icon="wrench" onClick={() => {}}>{plain(t("attendant.defectAction"))}</TextAction>
            </>
          }
        />
      )}
    </DetailContainer>
  );

  return (
    <HkHub
      items={items}
      kpis={hkKpis(rooms.map((r) => r.status), progress)}
      progress={progress}
      floors={empty ? [] : [3]}
      perFloor={[]}
      selectedId={selected}
      onSelect={setSelected}
      detail={panel}
      detailOpen={!!room}
    />
  );
}
