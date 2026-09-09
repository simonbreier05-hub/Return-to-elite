"use client";

import { useState } from "react";
import { api, ApiError } from "@/components/api";
import Modal from "@/components/Modal";
import { DEFECT_CATEGORIES, type DefectCategory } from "@/lib/domain";
import {
  CLEAN_TIMINGS,
  CLEAN_TIMING_LABELS,
  CONTACT_DEPARTMENTS,
  DND_WINDOWS,
  DND_WINDOW_LABELS,
  type CleanTiming,
  type DndWindow,
} from "@/lib/guest";

type ModalKind = "dnd" | "clean" | "defect" | "contact" | null;

const TILES: { kind: Exclude<ModalKind, null>; icon: string; title: string; hint: string }[] = [
  { kind: "dnd", icon: "🚫", title: "Bitte nicht stören", hint: "Zeitfenster wählen" },
  { kind: "clean", icon: "✨", title: "Jetzt reinigen", hint: "Zeitpunkt wählen" },
  { kind: "defect", icon: "⚠️", title: "Mangel melden", hint: "Kategorie & Beschreibung" },
  { kind: "contact", icon: "💬", title: "Abteilung kontaktieren", hint: "Zuständige Stelle wählen" },
];

/**
 * TEST/DEMO guest screen for room 305 (see src/app/guest/305/page.tsx). No
 * AppShell — a guest gets no staff header, notification bell, or logout.
 */
export default function GuestView({ roomNumber, floor }: { roomNumber: string; floor: number }) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<string | null>(null);

  const announce = (message: string) => {
    setModal(null);
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="guest-theme min-h-screen" style={{ background: "var(--g-cream)" }}>
      <div className="mx-auto max-w-2xl px-5 pb-28 pt-8 sm:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl leading-none tracking-[0.02em]" style={{ color: "var(--g-navy)" }}>
              ZIMMER {roomNumber}
            </h1>
            <p className="mt-1.5 text-xs uppercase tracking-[0.22em]" style={{ color: "var(--g-muted)" }}>
              Etage {floor}
            </p>
          </div>
          {/*
            Original mark (public/guest/hotel-crest.svg) + text wordmark —
            deliberately NOT a reproduction of any real hotel's logo (this
            is a fictional house). Swap both for whatever this house's own
            team supplies through proper brand channels, if that ever
            applies.
          */}
          <div className="flex items-center gap-2.5" aria-label="Hotel de Rome">
            <img src="/guest/hotel-crest.svg" alt="" className="h-9 w-9 shrink-0" />
            <div className="font-serif text-lg tracking-[0.14em]" style={{ color: "var(--g-navy)" }}>
              HOTEL
              <br />
              DE ROME
            </div>
          </div>
        </header>

        <div className="mt-5 h-px" style={{ background: "linear-gradient(90deg, var(--g-brass), transparent)" }} />

        {toast && (
          <div
            className="mt-5 rounded-xl border px-4 py-3 text-sm animate-rise"
            style={{ borderColor: "var(--g-brass)", background: "var(--g-panel)", color: "var(--g-navy)" }}
          >
            {toast}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
          {TILES.map((tile) => (
            <button
              key={tile.kind}
              onClick={() => setModal(tile.kind)}
              className="flex h-36 flex-col items-center justify-center gap-2 rounded-2xl border px-3 text-center shadow-sm transition active:scale-[0.98] sm:h-44"
              style={{ borderColor: "var(--g-panel)", background: "white" }}
            >
              <span className="text-3xl sm:text-4xl">{tile.icon}</span>
              <span className="font-serif text-base leading-tight sm:text-lg" style={{ color: "var(--g-navy)" }}>
                {tile.title}
              </span>
              <span className="text-[0.68rem] uppercase tracking-[0.1em]" style={{ color: "var(--g-muted)" }}>
                {tile.hint}
              </span>
            </button>
          ))}
        </div>

        <CommentField onSent={() => announce("Danke! Ihre Nachricht wurde an das Housekeeping übermittelt.")} />
      </div>

      {modal === "dnd" && (
        <DndModal onClose={() => setModal(null)} onSubmit={() => announce("Wird notiert — bitte nicht stören.")} />
      )}
      {modal === "clean" && (
        <CleanModal onClose={() => setModal(null)} onSubmit={() => announce("Ihr Reinigungswunsch wurde übermittelt.")} />
      )}
      {modal === "defect" && (
        <DefectModal onClose={() => setModal(null)} onSubmit={() => announce("Vielen Dank — die Meldung wurde weitergeleitet.")} />
      )}
      {modal === "contact" && (
        <ContactModal onClose={() => setModal(null)} onSubmit={(label) => announce(`${label} wurde benachrichtigt.`)} />
      )}
    </div>
  );
}

function ModalError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>;
}

function ConfirmButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="h-14 w-full rounded-xl text-base font-medium text-white disabled:opacity-50"
      style={{ background: "var(--g-navy)" }}
    >
      {busy ? "…" : children}
    </button>
  );
}

function DndModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [window, setWindowChoice] = useState<DndWindow>("NOW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/guest/room305/dnd", { body: { window } });
      onSubmit();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Das hat leider nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Bitte nicht stören" subtitle="Wie lange soll niemand ins Zimmer kommen?" onClose={onClose}>
      <ModalError error={error} />
      <div className="mb-4 grid gap-2">
        {DND_WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWindowChoice(w)}
            className={`h-14 rounded-xl border-2 text-base font-medium ${
              window === w ? "border-gold bg-parchment" : "border-charcoal/15"
            }`}
          >
            {DND_WINDOW_LABELS[w]}
          </button>
        ))}
      </div>
      <ConfirmButton busy={busy} onClick={confirm}>
        Bestätigen
      </ConfirmButton>
    </Modal>
  );
}

function CleanModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [timing, setTiming] = useState<CleanTiming>("NOW");
  const [time, setTime] = useState("15:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/guest/room305/clean-request", { body: { timing, time: timing === "LATER" ? time : undefined } });
      onSubmit();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Das hat leider nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Jetzt reinigen" subtitle="Wann dürfen wir Ihr Zimmer reinigen?" onClose={onClose}>
      <ModalError error={error} />
      <div className="mb-3 grid gap-2">
        {CLEAN_TIMINGS.map((t) => (
          <button
            key={t}
            onClick={() => setTiming(t)}
            className={`h-14 rounded-xl border-2 text-base font-medium ${
              timing === t ? "border-gold bg-parchment" : "border-charcoal/15"
            }`}
          >
            {t === "LATER" ? "Später heute – Uhrzeit wählen" : CLEAN_TIMING_LABELS[t]}
          </button>
        ))}
      </div>
      {timing === "LATER" && (
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mb-4 h-12 w-full rounded-lg border border-charcoal/20 px-3 text-base outline-none focus:border-gold"
        />
      )}
      <ConfirmButton busy={busy} onClick={confirm}>
        Bestätigen
      </ConfirmButton>
    </Modal>
  );
}

function DefectModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const [category, setCategory] = useState<DefectCategory>("PLUMBING");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("category", category);
      fd.set("note", note);
      if (photo) fd.set("photo", photo);
      await api("/api/guest/room305/defect", { formData: fd });
      onSubmit();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Das hat leider nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Mangel melden" subtitle="Wird direkt an die Technik weitergeleitet." onClose={onClose}>
      <ModalError error={error} />
      <label className="mb-1 block text-sm font-medium">Kategorie</label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {DEFECT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`h-11 rounded-lg border text-sm ${
              category === c ? "border-gold bg-parchment font-semibold" : "border-charcoal/15"
            }`}
          >
            {c.replace(/_/g, " / ")}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium">Beschreibung (optional)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mb-3 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
        placeholder="Was ist das Problem?"
      />
      <label className="mb-1 block text-sm font-medium">Foto (optional)</label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mb-4 block w-full text-sm"
      />
      <ConfirmButton busy={busy} onClick={confirm}>
        Melden
      </ConfirmButton>
    </Modal>
  );
}

function ContactModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (label: string) => void }) {
  const [department, setDepartment] = useState(CONTACT_DEPARTMENTS[0].key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/guest/room305/contact", { body: { department } });
      onSubmit(CONTACT_DEPARTMENTS.find((d) => d.key === department)!.label);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Das hat leider nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Abteilung kontaktieren" subtitle="Wer soll sich bei Ihnen melden?" onClose={onClose}>
      <ModalError error={error} />
      <div className="mb-4 grid gap-2">
        {CONTACT_DEPARTMENTS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDepartment(d.key)}
            className={`h-14 rounded-xl border-2 text-base font-medium ${
              department === d.key ? "border-gold bg-parchment" : "border-charcoal/15"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <ConfirmButton busy={busy} onClick={confirm}>
        Kontaktieren
      </ConfirmButton>
    </Modal>
  );
}

function CommentField({ onSent }: { onSent: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/guest/room305/notes", { body: { body } });
      setBody("");
      onSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Das hat leider nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8">
      <label className="mb-1 block text-sm font-medium" style={{ color: "var(--g-navy)" }}>
        Nachricht an das Housekeeping (optional)
      </label>
      {error && <p className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="w-full rounded-xl border p-3 text-base outline-none"
          style={{ borderColor: "var(--g-panel)" }}
          placeholder="Ihre Nachricht…"
        />
        <button
          onClick={send}
          disabled={busy || !body.trim()}
          className="h-auto shrink-0 rounded-xl px-5 text-sm font-medium text-white disabled:opacity-40"
          style={{ background: "var(--g-brass)" }}
        >
          {busy ? "…" : "Senden"}
        </button>
      </div>
    </div>
  );
}
