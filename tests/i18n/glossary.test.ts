import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-i18n-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { GLOSSARY, glossaryTarget, protect, restore, termRegex } from "@/lib/i18n/glossary";
import { getRuntimeBundle } from "@/lib/i18n/runtimeBundle";
import { setTranslationProviderForTests, type TranslationProvider, type TranslationRequest } from "@/lib/translation/provider";
import { SOURCE_DICTS } from "@/lib/i18n/core";
import { PRIORITY_LANGUAGES } from "@/lib/i18n/languages";
import type { LocaleFile } from "@/lib/i18n/bundles";

/** Test-Anbieter: „übersetzt“ durch Voranstellen von «pl:», lässt Marker stehen — und zählt die Aufrufe. */
function fakeProvider(opts: { dropMarkersFor?: string; fail?: boolean } = {}) {
  const calls: TranslationRequest[] = [];
  const p: TranslationProvider = {
    id: "fake",
    async translate(req) {
      calls.push(req);
      if (opts.fail) throw new Error("offline");
      return req.texts.map((t) => (opts.dropMarkersFor && t.includes(opts.dropMarkersFor) ? "kaputt" : `«${req.target}» ${t}`));
    },
  };
  return { p, calls };
}

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => {
  setTranslationProviderForTests(undefined);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("Glossar-Schutz", () => {
  it("ersetzt Fachbegriffe und Platzhalter durch Marker und setzt den Zielbegriff ein", () => {
    const p = protect("Zimmer {{n}}: Abreise, Wäschewechsel, DND, Etage 3", "vi");
    expect(p.text).toBe("Zimmer ⟦0⟧: ⟦1⟧, ⟦2⟧, ⟦3⟧, ⟦4⟧ 3");
    expect(restore("Phòng ⟦0⟧: ⟦1⟧, ⟦2⟧, ⟦3⟧, ⟦ 4 ⟧ 3", p.tokens)).toBe("Phòng {{n}}: Check-out, Thay đồ vải, DND, Tầng 3");
  });
  it("nur ganze Wörter, längste Form zuerst", () => {
    expect("Etagenliste".match(termRegex(GLOSSARY.find((g) => g.id === "floor")!))).toBeNull();
    expect(protect("Abreisen", "it").tokens).toEqual(["Partenza"]);
  });
  it("feste Begriffe gelten auch für Sprachen ohne Eintrag; andere werden frei übersetzt", () => {
    expect(protect("Trace und Credits", "pl").tokens.sort()).toEqual(["Credits", "Trace"]);
    expect(protect("Abreise", "pl").tokens).toEqual([]);
    expect(glossaryTarget(GLOSSARY.find((g) => g.id === "supervisor")!, "fa")).toBe("سوپروایزر");
  });
  it("fehlender Marker in der Antwort → Text wird verworfen", () => {
    expect(restore("ohne Marker", protect("Abreise", "vi").tokens)).toBeNull();
  });
});

describe("Laufzeit-Übersetzung (Sprachen ohne eigene Datei)", () => {
  it("ohne Anbieter: leer, Client zeigt Englisch", async () => {
    setTranslationProviderForTests(null);
    const b = await getRuntimeBundle("pl");
    expect(b?.strings).toEqual({});
    expect(b?.missing).toBe(Object.keys(SOURCE_DICTS.de).length);
  });
  it("übersetzt einmal, Glossar angewendet, danach aus dem Zwischenspeicher", async () => {
    const { p, calls } = fakeProvider();
    setTranslationProviderForTests(p);
    const first = await getRuntimeBundle("pl");
    expect(first?.missing).toBe(0);
    expect(first?.strings["attendant.floor"]).toBe("«pl» Etage {{floor}}"); // Etage: kein pl-Eintrag → frei
    expect(first?.strings["blockReasonShort.DND"]).toBe("«pl» DND");
    expect(calls[0].glossary.some((g) => g.source === "DND" && g.target === "DND")).toBe(true);
    expect(calls.every((c) => c.source === "de" && c.purpose === "ui")).toBe(true);
    const n = calls.length;
    const again = await getRuntimeBundle("pl");
    expect(calls.length).toBe(n); // kein zweiter Anbieter-Aufruf
    expect(again?.strings).toEqual(first?.strings);
  });
  it("geänderter deutscher Quelltext wird neu übersetzt", async () => {
    await prisma.uiTranslation.update({ where: { lang_key: { lang: "pl", key: "common.save" } }, data: { sourceHash: "alt" } });
    const { p, calls } = fakeProvider();
    setTranslationProviderForTests(p);
    await getRuntimeBundle("pl");
    expect(calls.flatMap((c) => c.texts)).toEqual(["Speichern"]);
  });
  it("Anbieter-Ausfall: nichts geht verloren, fehlende Texte bleiben Englisch", async () => {
    const { p } = fakeProvider({ fail: true });
    setTranslationProviderForTests(p);
    const b = await getRuntimeBundle("sv");
    expect(b?.strings).toEqual({});
    expect(await prisma.uiTranslation.count({ where: { lang: "sv" } })).toBe(0);
  });
  it("Antwort ohne Marker wird verworfen (Rückfall auf Englisch für diesen Text)", async () => {
    const { p } = fakeProvider({ dropMarkersFor: "⟦" });
    setTranslationProviderForTests(p);
    const b = await getRuntimeBundle("da");
    expect(b?.strings["attendant.floor"]).toBeUndefined();
    expect(b?.strings["common.save"]).toBe("«da» Speichern");
  });
  it("de/en/Prioritätssprachen und ungültige Codes gehen nie an den Anbieter", async () => {
    const { p, calls } = fakeProvider();
    setTranslationProviderForTests(p);
    for (const l of ["de", "en", "vi", "fa", "xx", "../etc"]) expect(await getRuntimeBundle(l)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe.each([...PRIORITY_LANGUAGES])("Glossar in der Sprachdatei %s", (lang) => {
  const file: LocaleFile = JSON.parse(readFileSync(path.join(__dirname, "../../src/lib/i18n/locales", `${lang}.json`), "utf8"));
  it("enthält den festgelegten Begriff, wo der deutsche Text ihn hat", () => {
    const lower = (s: string) => s.toLocaleLowerCase(lang);
    const misses: string[] = [];
    for (const [key, text] of Object.entries(file.strings)) {
      const de = SOURCE_DICTS.de[key] ?? "";
      for (const term of GLOSSARY) {
        if (!termRegex(term).test(de)) continue;
        const target = glossaryTarget(term, lang);
        if (!target) continue;
        const ok = [target, ...(term.alt?.[lang] ?? [])].some((t) => lower(text).includes(lower(t)));
        if (!ok) misses.push(`${key}: „${term.de[0]}“ → „${target}“ fehlt in „${text}“`);
      }
    }
    expect(misses).toEqual([]);
  });
});
