"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { api } from "@/components/api";
import { DEFECT_CATEGORIES } from "@/lib/domain";

/**
 * The guest self-service screen (NFC tap / QR / pre-arrival link). Mobile-
 * first, no login — wording and layout follow the reviewed mockups
 * (Abbildung_NFC-Zugang_Mockup.png) as closely as this file's comments call
 * out; the "Bitte nicht stören" panel isn't shown in either mockup version,
 * so its three window options are authored fresh, matching the tone and
 * three-option shape of "Jetzt reinigen".
 */

type Lang = "de" | "en";
type Panel = "dnd" | "clean" | "defect" | "contact" | null;

const STRINGS: Record<Lang, {
  hotel: string;
  floor: (f: number) => string;
  autoDetected: string;
  tiles: { dnd: string; clean: string; defect: string; contact: string };
  housekeepingMessage: string;
  housekeepingPlaceholder: string;
  send: string;
  confirm: string;
  optionalComment: string;
  commentPlaceholderQuiet: string;
  dndSubtitle: string;
  dndOptions: Record<"2H" | "TONIGHT" | "INDEFINITE", string>;
  cleanSubtitle: string;
  cleanOptions: Record<"now" | "soon" | "later", string>;
  laterTimeLabel: string;
  defectCategory: string;
  defectNote: string;
  defectNotePlaceholder: string;
  defectPhoto: string;
  contactDepartment: string;
  contactMessage: string;
  contactMessagePlaceholder: string;
  departments: Record<"concierge" | "engineering" | "front_office", string>;
  sending: string;
  done: string;
  errorGeneric: string;
}> = {
  de: {
    hotel: "HOTEL DE ROME",
    floor: (f) => `Etage ${f}`,
    autoDetected: "Automatisch erkannt · keine Anmeldung nötig",
    tiles: {
      dnd: "Bitte nicht stören",
      clean: "Jetzt reinigen",
      defect: "Mangel melden",
      contact: "Abteilung kontaktieren",
    },
    housekeepingMessage: "Nachricht an das Housekeeping (optional)",
    housekeepingPlaceholder: 'z. B. „Bitte zusätzliches Kopfkissen“ …',
    send: "Senden",
    confirm: "Bestätigen",
    optionalComment: "Kommentar hinzufügen (optional)",
    commentPlaceholderQuiet: 'z. B. „Bitte besonders leise“ …',
    dndSubtitle: "Wie lange soll nicht gestört werden?",
    dndOptions: { "2H": "2 Stunden", TONIGHT: "Bis heute Abend", INDEFINITE: "Bis auf Weiteres" },
    cleanSubtitle: "Anpassungsfenster (Beispiel)",
    cleanOptions: { now: "Sofort", soon: "In 30 Minuten", later: "Später heute – Uhrzeit wählen" },
    laterTimeLabel: "Uhrzeit",
    defectCategory: "Kategorie",
    defectNote: "Beschreibung",
    defectNotePlaceholder: "Was ist defekt?",
    defectPhoto: "Foto (optional)",
    contactDepartment: "Abteilung",
    contactMessage: "Nachricht",
    contactMessagePlaceholder: "Worum geht es?",
    departments: { concierge: "Concierge", engineering: "Technik", front_office: "Rezeption" },
    sending: "Wird gesendet…",
    done: "Erledigt.",
    errorGeneric: "Das hat nicht funktioniert. Bitte erneut versuchen.",
  },
  en: {
    hotel: "HOTEL DE ROME",
    floor: (f) => `Floor ${f}`,
    autoDetected: "Automatically detected · no sign-in needed",
    tiles: {
      dnd: "Do not disturb",
      clean: "Clean now",
      defect: "Report an issue",
      contact: "Contact department",
    },
    housekeepingMessage: "Message to housekeeping (optional)",
    housekeepingPlaceholder: 'e.g. "An extra pillow, please" …',
    send: "Send",
    confirm: "Confirm",
    optionalComment: "Add a comment (optional)",
    commentPlaceholderQuiet: 'e.g. "Please be extra quiet" …',
    dndSubtitle: "How long should we stay away?",
    dndOptions: { "2H": "2 hours", TONIGHT: "Until this evening", INDEFINITE: "Until further notice" },
    cleanSubtitle: "Adjust window (example)",
    cleanOptions: { now: "Right away", soon: "In 30 minutes", later: "Later today – choose a time" },
    laterTimeLabel: "Time",
    defectCategory: "Category",
    defectNote: "Description",
    defectNotePlaceholder: "What's broken?",
    defectPhoto: "Photo (optional)",
    contactDepartment: "Department",
    contactMessage: "Message",
    contactMessagePlaceholder: "What's this about?",
    departments: { concierge: "Concierge", engineering: "Engineering", front_office: "Front Office" },
    sending: "Sending…",
    done: "Done.",
    errorGeneric: "That didn't work. Please try again.",
  },
};

export default function GuestScreen({
  roomToken,
  roomNumber,
  floor,
}: {
  roomToken: string;
  roomNumber: string;
  floor: number;
}) {
  const [lang, setLang] = useState<Lang>("de");
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteDone, setNoteDone] = useState(false);
  const t = STRINGS[lang];

  const sendNote = async () => {
    if (!note.trim() || noteBusy) return;
    setNoteBusy(true);
    try {
      await api(`/api/guest/${roomToken}/note`, { body: { body: note.trim() } });
      setNote("");
      setNoteDone(true);
      setTimeout(() => setNoteDone(false), 3000);
    } catch {
      // A public, low-stakes field — fail quietly rather than alarm a guest.
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy px-4 py-8 font-sans text-ivory sm:flex sm:items-center sm:justify-center">
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl bg-navy shadow-2xl ring-1 ring-navy-line/40">
        {/* Header */}
        <div className="px-5 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-2xl tracking-wide">ZIMMER {roomNumber}</h1>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">{t.hotel}</p>
              <p className="mt-1 text-sm text-ivory/60">{t.floor(floor)}</p>
            </div>
            <button
              onClick={() => setLang(lang === "de" ? "en" : "de")}
              className="shrink-0 rounded-full border border-gold-line/60 px-3 py-1 text-xs font-semibold tracking-wide text-gold-soft"
              aria-label="Switch language"
            >
              {lang === "de" ? "DE" : "EN"} / {lang === "de" ? "EN" : "DE"}
            </button>
          </div>
          <div className="mt-3 h-0.5 w-10 bg-gold" />
        </div>

        {/* Tiles */}
        <div className="bg-ivory px-5 pb-5 pt-5 text-charcoal">
          <div className="grid grid-cols-2 gap-3">
            <Tile icon="🚫" label={t.tiles.dnd} onClick={() => setPanel("dnd")} />
            <Tile icon="✦" label={t.tiles.clean} onClick={() => setPanel("clean")} />
            <Tile icon="⚠" label={t.tiles.defect} onClick={() => setPanel("defect")} />
            <Tile icon="💬" label={t.tiles.contact} onClick={() => setPanel("contact")} />
          </div>

          <label className="mb-1 mt-5 block text-xs font-medium text-graphite/70">{t.housekeepingMessage}</label>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.housekeepingPlaceholder}
              className="h-11 flex-1 rounded-lg border border-charcoal/15 bg-linen px-3 text-sm outline-none focus:border-gold"
            />
            <button
              onClick={sendNote}
              disabled={!note.trim() || noteBusy}
              aria-label={t.send}
              className="h-11 w-11 shrink-0 rounded-lg bg-navy text-ivory disabled:opacity-40"
            >
              ➤
            </button>
          </div>
          {noteDone && <p className="mt-1 text-xs text-emerald-700">{t.done}</p>}

          <p className="mt-5 text-center text-[0.7rem] text-graphite/50">{t.autoDetected}</p>
        </div>
      </div>

      {panel === "dnd" && <DndPanel t={t} roomToken={roomToken} onClose={() => setPanel(null)} />}
      {panel === "clean" && <CleanPanel t={t} roomToken={roomToken} onClose={() => setPanel(null)} />}
      {panel === "defect" && <DefectPanel t={t} roomToken={roomToken} onClose={() => setPanel(null)} />}
      {panel === "contact" && <ContactPanel t={t} roomToken={roomToken} onClose={() => setPanel(null)} />}
    </div>
  );
}

function Tile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-charcoal/10 bg-white px-3 text-center shadow-sm transition active:scale-[0.98]"
    >
      <span className="text-2xl text-navy">{icon}</span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
    </button>
  );
}

type Strings = (typeof STRINGS)["de"];

function RadioRow<T extends string>({
  value,
  current,
  label,
  onSelect,
}: {
  value: T;
  current: T;
  label: string;
  onSelect: (v: T) => void;
}) {
  return (
    <button
      onClick={() => onSelect(value)}
      className="mb-2 flex w-full items-center gap-3 rounded-lg border border-charcoal/15 p-3 text-left"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          current === value ? "border-gold" : "border-charcoal/30"
        }`}
      >
        {current === value && <span className="h-2.5 w-2.5 rounded-full bg-gold" />}
      </span>
      <span className={current === value ? "font-semibold" : ""}>{label}</span>
    </button>
  );
}

function ConfirmButton({
  onClick,
  busy,
  disabled,
  label,
  busyLabel,
}: {
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="mt-4 h-14 w-full rounded-xl bg-navy text-base font-semibold text-ivory disabled:opacity-40"
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function DndPanel({ t, roomToken, onClose }: { t: Strings; roomToken: string; onClose: () => void }) {
  const [dndWindow, setWindowChoice] = useState<"2H" | "TONIGHT" | "INDEFINITE">("2H");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/guest/${roomToken}/dnd`, { body: { window: dndWindow, comment: comment.trim() || undefined } });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.tiles.dnd} subtitle={t.dndSubtitle} onClose={onClose}>
      {(Object.keys(t.dndOptions) as (keyof typeof t.dndOptions)[]).map((key) => (
        <RadioRow key={key} value={key} current={dndWindow} label={t.dndOptions[key]} onSelect={setWindowChoice} />
      ))}
      <label className="mb-1 mt-3 block text-sm font-medium">{t.optionalComment}</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder={t.commentPlaceholderQuiet}
        className="w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {done && <p className="mt-2 text-sm text-emerald-700">{t.done}</p>}
      <ConfirmButton onClick={submit} busy={busy} label={t.confirm} busyLabel={t.sending} />
    </Modal>
  );
}

function CleanPanel({ t, roomToken, onClose }: { t: Strings; roomToken: string; onClose: () => void }) {
  const [target, setTarget] = useState<"now" | "soon" | "later">("now");
  const [laterTime, setLaterTime] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (target === "later" && !laterTime) {
      setError(t.errorGeneric);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let laterAt: string | undefined;
      if (target === "later" && laterTime) {
        const at = new Date();
        const [h, m] = laterTime.split(":").map(Number);
        at.setHours(h, m, 0, 0);
        laterAt = at.toISOString();
      }
      await api(`/api/guest/${roomToken}/clean`, { body: { target, laterAt, comment: comment.trim() || undefined } });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.tiles.clean} subtitle={t.cleanSubtitle} onClose={onClose}>
      {(Object.keys(t.cleanOptions) as (keyof typeof t.cleanOptions)[]).map((key) => (
        <RadioRow key={key} value={key} current={target} label={t.cleanOptions[key]} onSelect={setTarget} />
      ))}
      {target === "later" && (
        <div className="mb-2 pl-8">
          <label className="mb-1 block text-xs font-medium text-graphite/70">{t.laterTimeLabel}</label>
          <input
            type="time"
            value={laterTime}
            onChange={(e) => setLaterTime(e.target.value)}
            className="h-11 rounded-lg border border-charcoal/20 px-3 text-base outline-none focus:border-gold"
          />
        </div>
      )}
      <label className="mb-1 mt-3 block text-sm font-medium">{t.optionalComment}</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder={t.commentPlaceholderQuiet}
        className="w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {done && <p className="mt-2 text-sm text-emerald-700">{t.done}</p>}
      <ConfirmButton onClick={submit} busy={busy} label={t.confirm} busyLabel={t.sending} />
    </Modal>
  );
}

function DefectPanel({ t, roomToken, onClose }: { t: Strings; roomToken: string; onClose: () => void }) {
  const [category, setCategory] = useState<(typeof DEFECT_CATEGORIES)[number]>("OTHER");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("category", category);
      fd.set("note", note.trim());
      if (photo) fd.set("photo", photo);
      await api(`/api/guest/${roomToken}/defect`, { formData: fd });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.tiles.defect} onClose={onClose}>
      <label className="mb-1 block text-sm font-medium">{t.defectCategory}</label>
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
      <label className="mb-1 block text-sm font-medium">{t.defectNote}</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={t.defectNotePlaceholder}
        className="mb-3 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
      />
      <label className="mb-1 block text-sm font-medium">{t.defectPhoto}</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mb-2 w-full text-sm"
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {done && <p className="mb-2 text-sm text-emerald-700">{t.done}</p>}
      <ConfirmButton onClick={submit} busy={busy} disabled={!note.trim()} label={t.confirm} busyLabel={t.sending} />
    </Modal>
  );
}

function ContactPanel({ t, roomToken, onClose }: { t: Strings; roomToken: string; onClose: () => void }) {
  const [department, setDepartment] = useState<"concierge" | "engineering" | "front_office">("front_office");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/guest/${roomToken}/contact`, { body: { department, message: message.trim() } });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.tiles.contact} onClose={onClose}>
      <label className="mb-1 block text-sm font-medium">{t.contactDepartment}</label>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(Object.keys(t.departments) as (keyof typeof t.departments)[]).map((d) => (
          <button
            key={d}
            onClick={() => setDepartment(d)}
            className={`h-11 rounded-lg border text-sm ${
              department === d ? "border-gold bg-parchment font-semibold" : "border-charcoal/15"
            }`}
          >
            {t.departments[d]}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium">{t.contactMessage}</label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder={t.contactMessagePlaceholder}
        className="w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {done && <p className="mt-2 text-sm text-emerald-700">{t.done}</p>}
      <ConfirmButton onClick={submit} busy={busy} disabled={!message.trim()} label={t.confirm} busyLabel={t.sending} />
    </Modal>
  );
}
