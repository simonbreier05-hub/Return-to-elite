import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CloseButton from "@/components/CloseButton";
import ImageLightbox from "@/components/ImageLightbox";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";

const SRC = path.join(__dirname, "..", "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(SRC).filter((f) => /\.(tsx)$/.test(f));
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));

describe("Schließen-Button", () => {
  it("Symbol und Wort, mit Beschriftung für Screenreader", () => {
    const out = html(h(CloseButton, { onClick: () => {} }));
    expect(out).toContain('aria-label="Schließen"');
    expect(out).toContain("✕");
    expect(out).toContain(">Schließen<");
  });
  it("Bild: Vorschau ist ein Button zum Vergrößern; das Vollbild (offen) hat Schließen", () => {
    const out = html(h(ImageLightbox, { src: "/x.png", alt: "Mangel-Foto", className: "h-10" }));
    expect(out).toMatch(/<button[^>]*aria-label="Mangel-Foto — Vergrößern"/);
    expect(out).not.toContain('role="dialog"'); // geschlossen
    expect(readFileSync(path.join(SRC, "components/ImageLightbox.tsx"), "utf8")).toMatch(/<CloseButton/);
  });
});

describe("Jedes Fenster / jede Seitenleiste hat einen sichtbaren Schließen-Button und Esc", () => {
  const overlays = files.filter((f) => /fixed inset-0/.test(readFileSync(f, "utf8")));
  it("findet die bekannten Fenster", () => {
    expect(overlays.map(rel)).toEqual(expect.arrayContaining(["components/Modal.tsx", "components/guest/GuestModal.tsx", "components/ImageLightbox.tsx", "app/supervisor/view.tsx", "app/front-office/view.tsx"]));
  });
  for (const f of overlays) {
    it(rel(f), () => {
      const s = readFileSync(f, "utf8");
      expect(s, "Schließen-Button").toMatch(/<CloseButton|common\.close/);
      expect(s, "Esc schließt").toMatch(/useEscapeKey/);
    });
  }
  it("die Meldungsliste im Kopf (AppShell) lässt sich schließen", () => {
    const s = readFileSync(path.join(SRC, "components/AppShell.tsx"), "utf8");
    expect(s).toMatch(/<CloseButton onClick=\{\(\) => setOpen\(false\)\}/);
    expect(s).toMatch(/useEscapeKey\(\(\) => setOpen\(false\), open\)/);
  });
});

describe("Jede Unterseite hat einen Zurück-Button", () => {
  const HOMES = new Set(["attendant", "concierge", "duty-manager", "engineering", "front-office", "houseman", "supervisor"]);
  const pages = files.filter((f) => f.endsWith("/page.tsx") && !rel(f).startsWith("app/g/") && rel(f) !== "app/page.tsx" && !rel(f).startsWith("app/login"));
  for (const f of pages) {
    const name = rel(f).replace("app/", "").replace("/page.tsx", "");
    if (HOMES.has(name)) continue;
    it(`/${name}`, () => {
      const s = readFileSync(f, "utf8");
      const view = (() => { try { return readFileSync(path.join(path.dirname(f), "view.tsx"), "utf8"); } catch { return ""; } })();
      const planung = readFileSync(path.join(SRC, "components/planung/PlanungClient.tsx"), "utf8");
      const ok = /backHref=/.test(s) || /← Zurück/.test(view) || (name === "planung" && /planungTool\.leave/.test(planung));
      expect(ok).toBe(true);
    });
  }
  it("der Zurück-Pfeil im Kopf zeigt auch das Wort Zurück", () => {
    expect(readFileSync(path.join(SRC, "components/AppShell.tsx"), "utf8")).toMatch(/<span className="hidden sm:inline">\{t\("appShell\.back"\)\}<\/span>/);
  });
});
