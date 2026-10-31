// @vitest-environment jsdom
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleContext";
import vi_ from "@/lib/i18n/locales/vi.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Call = { url: string; method: string; body?: unknown };
let calls: Call[] = [];
let me: { user: { id: string; language: string | null } | null; hotelDefaultLanguage: string } = { user: { id: "u1", language: null }, hotelDefaultLanguage: "de" };

function mockFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u === "/api/auth/me" && method === "GET") return new Response(JSON.stringify(me), { status: me.user ? 200 : 401 });
    if (u === "/api/auth/me" && method === "PATCH") return new Response(JSON.stringify({ language: (calls.at(-1)!.body as { language: string }).language }));
    if (u === "/api/i18n/default") return new Response(JSON.stringify({ language: me.hotelDefaultLanguage }));
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

let api: ReturnType<typeof useLocale> | null = null;
function Probe() {
  api = useLocale();
  return h("span", { id: "probe" }, api.t("common.save"));
}

let root: Root;
let el: HTMLDivElement;
const text = () => el.querySelector("#probe")?.textContent;
/** Wartet, bis alle Ladevorgänge (Fetch, nachgeladene Sprachdatei) durch sind — die Dateien sind groß, daher nicht nur ein Takt. */
const flush = async () => {
  let quiet = 0;
  for (let i = 0; i < 200 && quiet < 5; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    quiet = api && !api.loading ? quiet + 1 : 0;
  }
};

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.lang = "";
  document.documentElement.dir = "";
  Object.defineProperty(navigator, "languages", { value: ["de-DE"], configurable: true });
  me = { user: { id: "u1", language: null }, hotelDefaultLanguage: "de" };
  mockFetch();
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
});

const mount = async () => {
  await act(async () => root.render(h(LocaleProvider, null, h(Probe))));
  await flush();
};

describe("Sprachwechsel", () => {
  it("wirkt sofort ohne Neuladen und wird am Nutzer gespeichert", async () => {
    await mount();
    expect(text()).toBe("Speichern");
    const before = window.location.href;
    await act(async () => api!.setLocale("vi"));
    await flush();
    expect(text()).toBe(vi_.strings["common.save"]);
    expect(document.documentElement.lang).toBe("vi");
    expect(window.location.href).toBe(before);
    expect(calls).toContainEqual({ url: "/api/auth/me", method: "PATCH", body: { language: "vi" } });
    expect(localStorage.getItem("stayclean.locale")).toBe("vi");
    expect(api!.quality).toBe("unreviewed"); // Kennzeichnung „nicht muttersprachlich geprüft“
  });
  it("Persisch schaltet auf rechts-nach-links, zurück auf Deutsch wieder links-nach-rechts", async () => {
    await mount();
    await act(async () => api!.setLocale("fa"));
    await flush();
    expect(document.documentElement.dir).toBe("rtl");
    await act(async () => api!.setLocale("de"));
    await flush();
    expect(document.documentElement.dir).toBe("ltr");
    expect(text()).toBe("Speichern");
  });
  it("gilt auf jedem Gerät: die Server-Sprache gewinnt über das Gerät", async () => {
    localStorage.setItem("stayclean.locale", "it");
    me = { user: { id: "u1", language: "tr" }, hotelDefaultLanguage: "de" };
    await mount();
    expect(api!.locale).toBe("tr");
    expect(localStorage.getItem("stayclean.locale")).toBe("tr");
  });
  it("noch nie gewählt: Hotel-Standard, und die Browser-Sprache wird nur vorgeschlagen", async () => {
    Object.defineProperty(navigator, "languages", { value: ["hi-IN", "en"], configurable: true });
    me = { user: { id: "u1", language: null }, hotelDefaultLanguage: "en" };
    await mount();
    expect(api!.locale).toBe("en");
    expect(api!.suggestion).toBe("hi");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await act(async () => api!.dismissSuggestion()); // „Nein, bei Englisch bleiben“ → gespeichert, nicht mehr fragen
    await flush();
    expect(api!.suggestion).toBeNull();
    expect(calls).toContainEqual({ url: "/api/auth/me", method: "PATCH", body: { language: "en" } });
  });
  it("Sprache ohne eigene Datei und ohne Anbieter: Anzeige Englisch, gekennzeichnet", async () => {
    await mount();
    await act(async () => api!.setLocale("pl"));
    await flush();
    expect(api!.locale).toBe("pl");
    expect(text()).toBe("Save");
    expect(api!.quality).toBe("fallback");
  });
  it("Gäste-Screen (/g/…) bleibt unberührt", async () => {
    window.history.pushState({}, "", "/g/r/abc");
    localStorage.setItem("stayclean.locale", "fa");
    await mount();
    expect(calls).toEqual([]);
    expect(document.documentElement.dir).toBe("");
    window.history.pushState({}, "", "/");
  });
});
