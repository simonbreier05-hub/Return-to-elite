/**
 * Hinweiston (Paket O1): kurz, selbst erzeugt über Web Audio (keine Datei, kein fremder Markenton).
 * Normal = ein weicher Zweiklang, dringend = derselbe Klang zweimal.
 * iPad/Safari spielt erst nach einer Nutzer-Geste: `unlockSound()` wird aus einem Tipp heraus aufgerufen
 * (Banner „Ton aktivieren“ bzw. die erste Berührung auf der Seite, wenn der Ton schon an ist).
 * Einstellung je Gerät in localStorage (`stayclean.sound`), immer in try/catch.
 */
import { parseSoundPref, type SoundPref } from "./notify";

const PREF_KEY = "stayclean.sound";
let ctx: AudioContext | null = null;

export function readSoundPref(): SoundPref {
  try {
    return parseSoundPref(window.localStorage.getItem(PREF_KEY));
  } catch {
    return null;
  }
}

export function writeSoundPref(v: "on" | "off"): void {
  try {
    window.localStorage.setItem(PREF_KEY, v);
  } catch {
    /* privates Fenster o. ä.: Einstellung gilt dann nur bis zum Neuladen */
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Aus einer Nutzer-Geste heraus aufrufen: entsperrt die Audio-Ausgabe (Safari). */
export function unlockSound(): void {
  const c = audioContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  // Ein stummer Puffer gilt in älterem Safari als „abgespielt“ und entsperrt die Ausgabe sicher.
  try {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {
    /* egal */
  }
}

export function soundUnlocked(): boolean {
  return ctx?.state === "running";
}

function tone(c: AudioContext, freq: number, at: number, dur: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/**
 * Spielt den Hinweiston, wenn er auf diesem Gerät an ist. Sendet außerdem `stayclean:sound` (CustomEvent mit
 * `{ kind }`) auf window — Testhaken für die Browser-Tests, ohne Inhalt der Meldung.
 */
export function playNotifySound(kind: "normal" | "urgent"): boolean {
  if (typeof window === "undefined" || readSoundPref() !== "on") return false;
  const c = audioContext();
  let played = false;
  if (c && c.state === "running") {
    const t0 = c.currentTime + 0.01;
    const chime = (s: number) => { tone(c, 880, s, 0.14); tone(c, 1318.5, s + 0.12, 0.22); };
    chime(t0);
    if (kind === "urgent") chime(t0 + 0.45);
    played = true;
  }
  try {
    window.dispatchEvent(new CustomEvent("stayclean:sound", { detail: { kind, played } }));
  } catch {
    /* alte Browser */
  }
  return played;
}
