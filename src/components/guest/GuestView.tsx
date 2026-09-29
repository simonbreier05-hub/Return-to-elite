"use client";

import { useMemo, useState } from "react";
import { api, ApiError, NetworkError } from "@/components/api";
import GuestModal from "./GuestModal";
import GuestLanguageSwitcher from "./GuestLanguageSwitcher";
import GuestOfflineBar from "./GuestOfflineBar";
import { useGuestOfflineQueue } from "./useGuestOfflineQueue";
import { useGuestStatusFeed, type GuestStatusItem } from "./useGuestStatusFeed";
import { GuestLocaleProvider, useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";
import type { GuestTKey } from "@/lib/guestI18n/translations";
import { DEFECT_CATEGORIES, type DefectCategory } from "@/lib/domain";
import { CLEAN_TIMINGS, CONTACT_DEPARTMENTS, DND_WINDOWS, type CleanTiming, type DndWindow } from "@/lib/guest";

type ModalKind = "dnd" | "clean" | "defect" | "contact" | "requests" | "message" | null;

function parseDetail(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Guest screen for one room — shared between the two access-path pages
 * (src/app/g/r/[roomCode], src/app/g/s/[stayToken]), which resolve the
 * room and pass the base URL every action posts to, plus the guest's own
 * stay language. No AppShell — a guest gets no staff header, notification
 * bell, or logout. Theme + background come from the shared /g layout
 * (src/app/g/layout.tsx).
 */
export default function GuestView({
  roomNumber,
  floor,
  actionBase,
  stayLanguage,
}: {
  roomNumber: string;
  floor: number;
  /** e.g. "/api/guest/r/<roomCode>" or "/api/guest/s/<stayToken>" — never the real room number. */
  actionBase: string;
  stayLanguage?: string | null;
}) {
  return (
    <GuestLocaleProvider initialLocale={stayLanguage}>
      <GuestScreen roomNumber={roomNumber} floor={floor} actionBase={actionBase} />
    </GuestLocaleProvider>
  );
}

function GuestScreen({ roomNumber, floor, actionBase }: { roomNumber: string; floor: number; actionBase: string }) {
  const { t } = useGuestLocale();
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<string | null>(null);
  const offline = useGuestOfflineQueue();
  const { items, activeDnd, refresh } = useGuestStatusFeed(actionBase);

  const announce = (message: string) => {
    setModal(null);
    setToast(message);
    setTimeout(() => setToast(null), 4000);
    refresh();
  };

  const cancelDnd = async () => {
    if (!activeDnd) return;
    if (!window.confirm(t("dndActive.cancel") + "?")) return;
    try {
      await api(`${actionBase}/dnd-cancel`, { body: {} });
      announce(t("toast.dndCancelled"));
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/dnd-cancel`, body: {}, label: t("dndActive.cancel") });
      }
      setToast(e instanceof ApiError ? e.message : t("error.generic"));
      setTimeout(() => setToast(null), 4000);
    }
  };

  const dndDetail = parseDetail(activeDnd?.detail ?? null);
  const openCount = items.filter((i) => i.status === "RECEIVED" || i.status === "IN_PROGRESS").length;

  const tiles: { kind: Exclude<ModalKind, null>; icon: string; title: string; hint: string; active?: boolean }[] = [
    activeDnd
      ? {
          kind: "dnd",
          icon: "🔕",
          title: t("dndActive.cancel"),
          hint: dndDetail.window ? t(`dndWindow.${dndDetail.window}` as GuestTKey) : "",
          active: true,
        }
      : { kind: "dnd", icon: "🚫", title: t("tiles.dnd.title"), hint: t("tiles.dnd.hint") },
    { kind: "clean", icon: "✨", title: t("tiles.clean.title"), hint: t("tiles.clean.hint") },
    { kind: "defect", icon: "⚠️", title: t("tiles.defect.title"), hint: t("tiles.defect.hint") },
    { kind: "contact", icon: "💬", title: t("tiles.contact.title"), hint: t("tiles.contact.hint") },
  ];

  return (
    <div>
      <div className="mx-auto max-w-2xl px-5 pb-8 pt-6 sm:px-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-4xl leading-none tracking-[0.02em]" style={{ color: "var(--g-navy)" }}>
              {t("header.room", { number: roomNumber })}
            </h1>
            <p className="mt-1.5 text-xs uppercase tracking-[0.22em]" style={{ color: "var(--g-muted)" }}>
              {t("header.floor", { floor })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/*
              Original mark (public/guest/hotel-crest.svg) + text wordmark —
              deliberately NOT a reproduction of any real hotel's logo (this
              is a fictional house). Swap both for whatever this house's own
              team supplies through proper brand channels, if that ever
              applies.
            */}
            <div className="flex items-center gap-2.5" aria-label="Hotel de Rome">
              <img src="/guest/hotel-crest.svg" alt="" className="h-8 w-8 shrink-0" />
              <div className="font-serif text-base tracking-[0.14em]" style={{ color: "var(--g-navy)" }}>
                HOTEL
                <br />
                DE ROME
              </div>
            </div>
            <GuestLanguageSwitcher />
          </div>
        </header>

        <div className="mt-4 h-px" style={{ background: "linear-gradient(90deg, var(--g-brass), transparent)" }} />

        {toast && (
          <div
            className="mt-4 rounded-xl border px-4 py-3 text-sm animate-rise"
            style={{ borderColor: "var(--g-brass)", background: "var(--g-panel)", color: "var(--g-navy)" }}
          >
            {toast}
          </div>
        )}

        <div className="mt-4">
          <GuestOfflineBar state={offline} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 sm:gap-4">
          {tiles.map((tile) => (
            <button
              key={tile.kind}
              onClick={() => (tile.active ? cancelDnd() : setModal(tile.kind))}
              className="flex h-36 flex-col items-center justify-center gap-2 rounded-2xl border px-3 text-center shadow-sm transition active:scale-[0.98] sm:h-44"
              style={{
                borderColor: tile.active ? "var(--g-brass)" : "var(--g-panel)",
                background: tile.active ? "var(--g-panel)" : "white",
              }}
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

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setModal("requests")}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium"
            style={{ borderColor: "var(--g-panel)", color: "var(--g-navy)" }}
          >
            {t("status.title")}
            {openCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white"
                style={{ background: "var(--g-brass)" }}
              >
                {openCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setModal("message")}
            className="h-12 flex-1 rounded-xl text-sm font-medium text-white"
            style={{ background: "var(--g-navy)" }}
          >
            {t("comment.send")}
          </button>
        </div>
      </div>

      {modal === "dnd" && (
        <DndModal
          actionBase={actionBase}
          offline={offline}
          onClose={() => setModal(null)}
          onSubmit={() => announce(t("toast.dnd"))}
        />
      )}
      {modal === "clean" && (
        <CleanModal
          actionBase={actionBase}
          offline={offline}
          onClose={() => setModal(null)}
          onSubmit={() => announce(t("toast.clean"))}
        />
      )}
      {modal === "defect" && (
        <DefectModal actionBase={actionBase} onClose={() => setModal(null)} onSubmit={() => announce(t("toast.defect"))} />
      )}
      {modal === "contact" && (
        <ContactModal
          actionBase={actionBase}
          offline={offline}
          onClose={() => setModal(null)}
          onSubmit={(label) => announce(t("toast.contact", { department: label }))}
        />
      )}
      {modal === "requests" && <RequestsModal items={items} onClose={() => setModal(null)} />}
      {modal === "message" && (
        <MessageModal actionBase={actionBase} offline={offline} onClose={() => setModal(null)} onSent={() => announce(t("toast.note"))} />
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

interface OfflineEnqueue {
  enqueue: (input: { url: string; body: unknown; label: string }) => void;
}

function DndModal({
  actionBase,
  offline,
  onClose,
  onSubmit,
}: {
  actionBase: string;
  offline: OfflineEnqueue;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useGuestLocale();
  const [choice, setChoice] = useState<DndWindow>("NOW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`${actionBase}/dnd`, { body: { window: choice } });
      onSubmit();
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/dnd`, body: { window: choice }, label: t("tiles.dnd.title") });
        onSubmit();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestModal title={t("modal.dnd.title")} subtitle={t("modal.dnd.subtitle")} onClose={onClose}>
      <ModalError error={error} />
      <div className="mb-4 grid gap-2">
        {DND_WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setChoice(w)}
            className="h-14 rounded-xl border-2 text-base font-medium"
            style={
              choice === w
                ? { borderColor: "var(--g-brass)", background: "var(--g-panel)", color: "var(--g-navy)" }
                : { borderColor: "var(--g-panel)" }
            }
          >
            {t(`dndWindow.${w}` as GuestTKey)}
          </button>
        ))}
      </div>
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("modal.dnd.confirm")}
      </ConfirmButton>
    </GuestModal>
  );
}

function CleanModal({
  actionBase,
  offline,
  onClose,
  onSubmit,
}: {
  actionBase: string;
  offline: OfflineEnqueue;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useGuestLocale();
  const [timing, setTiming] = useState<CleanTiming>("NOW");
  const [time, setTime] = useState("15:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const body = { timing, time: timing === "LATER" ? time : undefined };
    try {
      await api(`${actionBase}/clean-request`, { body });
      onSubmit();
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/clean-request`, body, label: t("tiles.clean.title") });
        onSubmit();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestModal title={t("modal.clean.title")} subtitle={t("modal.clean.subtitle")} onClose={onClose}>
      <ModalError error={error} />
      <div className="mb-3 grid gap-2">
        {CLEAN_TIMINGS.map((tm) => (
          <button
            key={tm}
            onClick={() => setTiming(tm)}
            className="h-14 rounded-xl border-2 text-base font-medium"
            style={
              timing === tm
                ? { borderColor: "var(--g-brass)", background: "var(--g-panel)", color: "var(--g-navy)" }
                : { borderColor: "var(--g-panel)" }
            }
          >
            {tm === "LATER" ? t("modal.clean.laterLabel") : t(`cleanTiming.${tm}` as GuestTKey)}
          </button>
        ))}
      </div>
      {timing === "LATER" && (
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mb-4 h-12 w-full rounded-lg border px-3 text-base outline-none"
          style={{ borderColor: "var(--g-panel)" }}
        />
      )}
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("modal.clean.confirm")}
      </ConfirmButton>
    </GuestModal>
  );
}

/**
 * Not offline-queueable like the others: it carries an optional photo
 * (multipart/form-data), and the queue only knows how to replay a JSON
 * body. A guest reporting a defect while offline just sees the normal
 * error and can retry once connected.
 */
function DefectModal({ actionBase, onClose, onSubmit }: { actionBase: string; onClose: () => void; onSubmit: () => void }) {
  const { t } = useGuestLocale();
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
      await api(`${actionBase}/defect`, { formData: fd });
      onSubmit();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestModal title={t("modal.defect.title")} subtitle={t("modal.defect.subtitle")} onClose={onClose}>
      <ModalError error={error} />
      <label className="mb-1 block text-sm font-medium">{t("modal.defect.category")}</label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {DEFECT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="h-11 rounded-lg border text-sm"
            style={
              category === c
                ? { borderColor: "var(--g-brass)", background: "var(--g-panel)", fontWeight: 600 }
                : { borderColor: "var(--g-panel)" }
            }
          >
            {t(`defectCategory.${c}` as GuestTKey)}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium">{t("modal.defect.description")}</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mb-3 w-full rounded-lg border p-3 text-base outline-none"
        style={{ borderColor: "var(--g-panel)" }}
        placeholder={t("modal.defect.descriptionPlaceholder")}
      />
      <label className="mb-1 block text-sm font-medium">{t("modal.defect.photo")}</label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mb-4 block w-full text-sm"
      />
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("modal.defect.submit")}
      </ConfirmButton>
    </GuestModal>
  );
}

function ContactModal({
  actionBase,
  offline,
  onClose,
  onSubmit,
}: {
  actionBase: string;
  offline: OfflineEnqueue;
  onClose: () => void;
  onSubmit: (label: string) => void;
}) {
  const { t } = useGuestLocale();
  const [department, setDepartment] = useState(CONTACT_DEPARTMENTS[0].key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const label = t(`department.${department}` as GuestTKey);
    try {
      await api(`${actionBase}/contact`, { body: { department } });
      onSubmit(label);
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/contact`, body: { department }, label: t("tiles.contact.title") });
        onSubmit(label);
        return;
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestModal title={t("modal.contact.title")} subtitle={t("modal.contact.subtitle")} onClose={onClose}>
      <ModalError error={error} />
      <div className="mb-4 grid gap-2">
        {CONTACT_DEPARTMENTS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDepartment(d.key)}
            className="h-14 rounded-xl border-2 text-base font-medium"
            style={
              department === d.key
                ? { borderColor: "var(--g-brass)", background: "var(--g-panel)", color: "var(--g-navy)" }
                : { borderColor: "var(--g-panel)" }
            }
          >
            {t(`department.${d.key}` as GuestTKey)}
          </button>
        ))}
      </div>
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("modal.contact.submit")}
      </ConfirmButton>
    </GuestModal>
  );
}

function MessageModal({
  actionBase,
  offline,
  onClose,
  onSent,
}: {
  actionBase: string;
  offline: OfflineEnqueue;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useGuestLocale();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${actionBase}/notes`, { body: { body } });
      onSent();
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/notes`, body: { body }, label: t("comment.label") });
        onSent();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestModal title={t("comment.label")} onClose={onClose}>
      <ModalError error={error} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="mb-4 w-full rounded-xl border p-3 text-base outline-none"
        style={{ borderColor: "var(--g-panel)" }}
        placeholder={t("comment.placeholder")}
        autoFocus
      />
      <ConfirmButton busy={busy || !body.trim()} onClick={send}>
        {t("comment.send")}
      </ConfirmButton>
    </GuestModal>
  );
}

const STATUS_COLOR: Record<GuestStatusItem["status"], string> = {
  RECEIVED: "var(--color-status-inspected)",
  IN_PROGRESS: "var(--color-status-in-progress)",
  DONE: "var(--color-status-clean)",
  CANCELLED: "var(--g-muted)",
};

function requestItemLabel(t: ReturnType<typeof useGuestLocale>["t"], item: GuestStatusItem): string {
  const detail = parseDetail(item.detail);
  switch (item.kind) {
    case "DND":
      return detail.window ? t(`dndWindow.${detail.window}` as GuestTKey) : t("status.kind.DND");
    case "CLEAN_REQUEST":
      return detail.timing === "LATER" && detail.time
        ? `${t("cleanTiming.LATER" as GuestTKey)} – ${detail.time}`
        : detail.timing
          ? t(`cleanTiming.${detail.timing}` as GuestTKey)
          : t("status.kind.CLEAN_REQUEST");
    case "CONTACT":
      return detail.department ? t(`department.${detail.department}` as GuestTKey) : t("status.kind.CONTACT");
    case "DEFECT":
      return item.detail ? t(`defectCategory.${item.detail}` as GuestTKey) : t("status.kind.DEFECT");
    case "NOTE":
      return item.detail && item.detail.length > 60 ? `${item.detail.slice(0, 60)}…` : (item.detail ?? "");
  }
}

function RequestsModal({ items, onClose }: { items: GuestStatusItem[]; onClose: () => void }) {
  const { t } = useGuestLocale();
  const sorted = useMemo(() => items, [items]);

  return (
    <GuestModal title={t("status.title")} onClose={onClose}>
      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--g-muted)" }}>
          —
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              style={{ borderColor: "var(--g-panel)" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: "var(--g-navy)" }}>
                  {t(`status.kind.${item.kind}` as GuestTKey)}
                </p>
                <p className="truncate text-xs" style={{ color: "var(--g-muted)" }}>
                  {requestItemLabel(t, item)}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                style={{ background: STATUS_COLOR[item.status] }}
              >
                {t(`status.${item.status}` as GuestTKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GuestModal>
  );
}
