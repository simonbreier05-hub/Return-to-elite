import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression „Housekeeper: DND/Mangel zeigt nur grauen Filter“ (Fenster lag im transformierten Seitencontainer
 * `.animate-rise` und wurde dort unterhalb des Bildschirms verankert). Browser-Nachweis: tests/e2e/housekeeper-actions.e2e.mjs.
 */
const SRC = path.join(__dirname, "..", "..", "src");
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");

describe("Fenster auf Mobilgeräten", () => {
  it("gemeinsames Modal rendert per Portal in <body>", () => {
    const m = read("components/Modal.tsx");
    expect(m).toMatch(/createPortal\(/);
    expect(m).toMatch(/document\.body/);
  });

  it("Seitencontainer-Animation hält kein transform fest (kein `both`/`forwards` an .animate-rise)", () => {
    const rule = read("app/globals.css").match(/\.animate-rise\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/animation:/);
    expect(rule).not.toMatch(/\b(both|forwards)\b/);
  });

  it("Fensterhöhe nach sichtbarem Bereich (dvh) mit Safe-Area unten, Inhalt scrollbar", () => {
    const css = read("app/globals.css").match(/\.modal-sheet\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(css).toMatch(/max-height:\s*92dvh/);
    expect(css).toMatch(/safe-area-inset-bottom/);
    expect(read("components/Modal.tsx")).toMatch(/modal-sheet[^"`]*overflow-y-auto/);
  });

  it("Fensterinhalt steckt in einer ErrorBoundary (kein leeres Fenster bei Renderfehler)", () => {
    expect(read("components/Modal.tsx")).toMatch(/<ErrorBoundary>\{children\}<\/ErrorBoundary>/);
  });

  it("ausgefülltes Mangel-Fenster wird nicht durch Hintergrund-Tipp verworfen", () => {
    expect(read("components/Modal.tsx")).toMatch(/if \(!dirty\) close\(\)/);
    expect(read("app/attendant/view.tsx")).toMatch(/defectModalTitle[^\n]*dirty=\{/);
  });

  it("Bild-Vollansicht rendert ebenfalls per Portal", () => {
    expect(read("components/ImageLightbox.tsx")).toMatch(/createPortal\(/);
  });
});
