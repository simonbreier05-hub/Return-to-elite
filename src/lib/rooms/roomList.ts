import type { RoomType } from "@/lib/domain";

/**
 * Offizielle Zimmerliste v2.1 (Stand 12.11.2026): 145 Zimmer, Summe 170 Credits, Etagen 32/36/33/26/18.
 * Einzige Quelle für Zimmerstamm, Credit je Zimmer und „aktiv“. 307 steht bewusst nicht in der Liste
 * (nicht aktiv) — Zimmer außerhalb der Liste werden beim Sync nur deaktiviert, nie gelöscht.
 * Format je Zeile: Zimmer;Etage;Credits;Kategorie (wie die Vorlage, Dezimalkomma).
 */
export const ROOM_LIST_VERSION = "2.1";

const RAW = `
101;1;2;Deluxe Suite
102;1;1;CLK/DLK
104;1;2;Deluxe Suite
105;1;2;Deluxe Suite
109;1;2;Deluxe Suite
110;1;1,5;Junior Suite
111;1;1;CLK/DLK
112;1;1;CLK/DLK
114;1;1;CLK/DLK
115;1;1;CLK/DLK
116;1;1;CLK/DLK
117;1;1;CLK/DLK
118;1;1;CLK/DLK
119;1;1;CLK/DLK
120;1;1;CLK/DLK
121;1;1;CLK/DLK
122;1;1;CLK/DLK
123;1;1;CLK/DLK
124;1;1;CLK/DLK
125;1;1,5;Junior Suite
126;1;1;CLK/DLK
127;1;1;CLK/DLK
128;1;1;CLK/DLK
129;1;1;CLK/DLK
130;1;1,5;Junior Suite
131;1;1;CLK/DLK
132;1;1;CLK/DLK
133;1;1,5;Junior Suite
134;1;1,5;Junior Suite
135;1;1;CLK/DLK
136;1;1;CLK/DLK
137;1;1;CLK/DLK
201;2;1;CLK/DLK
202;2;1,5;Junior Suite
203;2;1,5;Junior Suite
204;2;1,75;Suite
205;2;1;CLK/DLK
206;2;1;CLK/DLK
207;2;1;CLK/DLK
208;2;1;CLK/DLK
209;2;1,5;Junior Suite
210;2;1;CLK/DLK
211;2;1;CLK/DLK
212;2;1;CLK/DLK
214;2;1;CLK/DLK
215;2;1;CLK/DLK
216;2;1;CLK/DLK
217;2;1;CLK/DLK
218;2;1;CLK/DLK
219;2;1;CLK/DLK
220;2;1;CLK/DLK
221;2;1;CLK/DLK
222;2;1;CLK/DLK
223;2;1;CLK/DLK
224;2;1;CLK/DLK
225;2;1,5;Junior Suite
226;2;1;CLK/DLK
227;2;1;CLK/DLK
228;2;1;CLK/DLK
229;2;1;CLK/DLK
230;2;1,5;Junior Suite
231;2;1;CLK/DLK
232;2;1;CLK/DLK
233;2;1,5;Junior Suite
234;2;1,5;Junior Suite
235;2;1;CLK/DLK
236;2;1;CLK/DLK
237;2;1;CLK/DLK
301;3;1;CLK/DLK
302;3;1,75;Suite
304;3;3,5;Präsidentensuite
308;3;1;CLK/DLK
309;3;1,5;Junior Suite
310;3;1;CLK/DLK
311;3;1;CLK/DLK
312;3;1;CLK/DLK
314;3;1;CLK/DLK
315;3;1;CLK/DLK
316;3;1;CLK/DLK
317;3;1;CLK/DLK
318;3;1;CLK/DLK
319;3;1;CLK/DLK
320;3;1;CLK/DLK
321;3;1;CLK/DLK
322;3;1;CLK/DLK
323;3;1;CLK/DLK
324;3;1;CLK/DLK
325;3;1,5;Junior Suite
326;3;1,5;Junior Suite
327;3;1;CLK/DLK
328;3;1;CLK/DLK
329;3;1,5;Junior Suite
330;3;1,5;Junior Suite
331;3;1,5;Junior Suite
332;3;1,5;Junior Suite
333;3;1,5;Junior Suite
334;3;1,5;Junior Suite
335;3;1;CLK/DLK
336;3;1;CLK/DLK
337;3;1;CLK/DLK
338;3;1;CLK/DLK
401;4;1;CLK/DLK
402;4;1;CLK/DLK
412;4;1;CLK/DLK
414;4;1;CLK/DLK
415;4;1;CLK/DLK
416;4;1;CLK/DLK
417;4;1;CLK/DLK
418;4;1;CLK/DLK
419;4;1;CLK/DLK
420;4;1;CLK/DLK
421;4;1;CLK/DLK
422;4;1;CLK/DLK
423;4;1;CLK/DLK
424;4;1;CLK/DLK
425;4;1,5;Junior Suite
426;4;1;CLK/DLK
428;4;1,5;Junior Suite
429;4;1,5;Junior Suite
430;4;1,75;Suite
431;4;1;CLK/DLK
432;4;1;CLK/DLK
433;4;1,5;Junior Suite
434;4;1,5;Junior Suite
435;4;1;CLK/DLK
436;4;1,5;Junior Suite
437;4;1;CLK/DLK
514;5;1,5;Junior Suite
515;5;1;CLK/DLK
517;5;1;CLK/DLK
518;5;1;CLK/DLK
519;5;1;CLK/DLK
521;5;1;CLK/DLK
522;5;1;CLK/DLK
523;5;1;CLK/DLK
524;5;1;CLK/DLK
525;5;1;CLK/DLK
526;5;1,75;Suite
529;5;1,75;Suite
530;5;1;CLK/DLK
531;5;1;CLK/DLK
532;5;1;CLK/DLK
533;5;1,75;Suite
534;5;1;CLK/DLK
535;5;1;CLK/DLK
`;

/** Kategorie der Liste → bestehender `RoomType` (Kategorie folgt dem Credit; der Credit selbst steht am Zimmer). */
export const LIST_CATEGORY_TYPE: Record<string, RoomType> = {
  "CLK/DLK": "CLASSIC",
  "Junior Suite": "JUNIOR_SUITE",
  Suite: "SUITE",
  "Deluxe Suite": "SUITE",
  Präsidentensuite: "PENTHOUSE",
};

export interface RoomListEntry { number: string; floor: number; credit: number; category: string; type: RoomType }

export const ROOM_LIST: readonly RoomListEntry[] = RAW.trim().split("\n").map((line) => {
  const [number, floor, credit, category] = line.split(";");
  const type = LIST_CATEGORY_TYPE[category];
  if (!type) throw new Error(`Zimmerliste: unbekannte Kategorie in Zimmer ${number}`);
  return { number, floor: Number(floor), credit: Number(credit.replace(",", ".")), category, type };
});

export interface ExistingRoom { number: string; floor: number; type: string; credit: number | null; active: boolean }
export interface RoomListPlan {
  create: RoomListEntry[];
  update: { entry: RoomListEntry; changes: string[] }[];
  deactivate: string[];
  unchanged: number;
}

/** Reiner Abgleich (kein DB-Zugriff): was ein Sync anlegen, ändern und deaktivieren würde. Löscht nie. */
export function planRoomListSync(existing: readonly ExistingRoom[], list: readonly RoomListEntry[] = ROOM_LIST): RoomListPlan {
  const byNumber = new Map(existing.map((r) => [r.number, r]));
  const inList = new Set(list.map((e) => e.number));
  const plan: RoomListPlan = { create: [], update: [], deactivate: [], unchanged: 0 };
  for (const e of list) {
    const r = byNumber.get(e.number);
    if (!r) { plan.create.push(e); continue; }
    const changes: string[] = [];
    if (r.floor !== e.floor) changes.push(`Etage ${r.floor}→${e.floor}`);
    if (r.type !== e.type) changes.push(`Typ ${r.type}→${e.type}`);
    if (r.credit !== e.credit) changes.push(`Credit ${r.credit ?? "–"}→${e.credit}`);
    if (!r.active) changes.push("wieder aktiv");
    if (changes.length) plan.update.push({ entry: e, changes }); else plan.unchanged++;
  }
  for (const r of existing) if (!inList.has(r.number) && r.active) plan.deactivate.push(r.number);
  plan.deactivate.sort();
  return plan;
}
