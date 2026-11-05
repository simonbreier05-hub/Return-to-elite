"use client";

import { useMemo, useState } from "react";
import { api, ApiError, NetworkError } from "@/components/api";
import { ActionTile } from "@/components/ui/ActionTile";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { FilterChip } from "@/components/ui/FilterChip";
import { Glyph, cx, FOCUS_RING, TONE_FG } from "@/components/ui/primitives";
import { HeaderPhoto } from "@/components/shell/HeaderPhoto";
import type { IconName } from "@/lib/ui/icons";
import type { Tone } from "@/lib/ui/tone";
import GuestModal from "./GuestModal";
import GuestLanguageSwitcher from "./GuestLanguageSwitcher";
import GuestOfflineBar from "./GuestOfflineBar";
import GuestLegalLinks from "./GuestLegalLinks";
import { useGuestOfflineQueue } from "./useGuestOfflineQueue";
import { useGuestStatusFeed, type GuestStatusItem } from "./useGuestStatusFeed";
import { GuestLocaleProvider, useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";
import type { GuestLocale, GuestTKey } from "@/lib/guestI18n/translations";
import type { GuestLegalLinkUrls } from "@/lib/guestLegalLinks";
import { DEFECT_CATEGORIES, type DefectCategory } from "@/lib/domain";
import { CLEAN_TIMINGS, CONTACT_DEPARTMENTS, DND_WINDOWS, type CleanTiming, type DndWindow } from "@/lib/guest";

type ModalKind = "dnd" | "dndCancel" | "clean" | "defect" | "contact" | "requests" | null;
type T = ReturnType<typeof useGuestLocale>["t"];

function parseDetail(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Status der Gast-Anfrage → Symbol + Ton (Text kommt aus `status.<STATUS>`; nie nur Farbe). */
const REQUEST_STATUS_UI: Record<GuestStatusItem["status"], { icon: IconName; tone: Tone }> = {
  RECEIVED: { icon: "circle", tone: "neutral" },
  IN_PROGRESS: { icon: "clock", tone: "info" },
  DONE: { icon: "check", tone: "success" },
  CANCELLED: { icon: "x", tone: "neutral" },
};

const DATE_LOCALE: Record<GuestLocale, string> = { de: "de-DE", en: "en-GB" };

/**
 * Guest screen for one room — shared between the two access-path pages
 * (src/app/g/r/[roomCode], src/app/g/s/[stayToken]), which resolve the
 * room and pass the base URL every action posts to, plus the guest's own
 * stay language. No AppShell — a guest gets no staff header, notification
 * bell, or logout. D6 „Glas & Premium“ (Figma `41:2827`): built from the
 * D0 building blocks in src/components/ui (pure presentation, texts come
 * in already translated from the guest's own dictionary).
 */
export default function GuestView({
  roomNumber,
  floor,
  actionBase,
  stayLanguage,
  legalLinks,
}: {
  roomNumber: string;
  floor: number;
  /** e.g. "/api/guest/r/<roomCode>" or "/api/guest/s/<stayToken>" — never the real room number. */
  actionBase: string;
  stayLanguage?: string | null;
  legalLinks?: GuestLegalLinkUrls;
}) {
  return (
    <GuestLocaleProvider initialLocale={stayLanguage}>
      <GuestScreen roomNumber={roomNumber} floor={floor} actionBase={actionBase} legalLinks={legalLinks} />
    </GuestLocaleProvider>
  );
}

function GuestScreen({
  roomNumber,
  floor,
  actionBase,
  legalLinks,
}: {
  roomNumber: string;
  floor: number;
  actionBase: string;
  legalLinks?: GuestLegalLinkUrls;
}) {
  const { t, locale } = useGuestLocale();
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const offline = useGuestOfflineQueue();
  const { items, activeDnd, refresh } = useGuestStatusFeed(actionBase);

  const showToast = (message: string, isError = false) => {
    setToast(message);
    setToastError(isError);
    setTimeout(() => setToast(null), 4000);
  };

  const announce = (message: string) => {
    setModal(null);
    showToast(message);
    refresh();
  };

  const dndDetail = parseDetail(activeDnd?.detail ?? null);
  const latest = useMemo(() => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [items]);

  const today = new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date());

  const dndHint = activeDnd
    ? [t("dndActive.short"), dndDetail.window ? t(`dndWindow.${dndDetail.window}` as GuestTKey) : null].filter(Boolean).join(" · ")
    : undefined;

  const tiles: { kind: Exclude<ModalKind, null>; icon: IconName; title: string; ariaLabel: string; active?: boolean; hint?: string }[] = [
    activeDnd
      ? {
          kind: "dndCancel",
          icon: "moon",
          title: t("tiles.dnd.title"),
          hint: dndHint,
          ariaLabel: `${t("dndActive.banner")}. ${dndHint ?? ""}. ${t("dndActive.cancel")}`,
          active: true,
        }
      : { kind: "dnd", icon: "moon", title: t("tiles.dnd.title"), ariaLabel: `${t("tiles.dnd.title")}: ${t("tiles.dnd.hint")}` },
    { kind: "clean", icon: "bed-single", title: t("tiles.clean.title"), ariaLabel: `${t("tiles.clean.title")}: ${t("tiles.clean.hint")}` },
    { kind: "defect", icon: "wrench", title: t("tiles.defect.title"), ariaLabel: `${t("tiles.defect.title")}: ${t("tiles.defect.hint")}` },
    { kind: "contact", icon: "message", title: t("tiles.contact.title"), ariaLabel: `${t("tiles.contact.title")}: ${t("tiles.contact.hint")}` },
  ];

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <HeaderPhoto />
      <main className="relative mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 pb-7 pt-4 sm:px-8">
        <div className="flex justify-end">
          <GuestLanguageSwitcher />
        </div>

        <header>
          <p className="text-label text-text-secondary" suppressHydrationWarning>
            {today}
          </p>
          <h1 className="text-title-28 text-text-primary">{t("header.welcome")}</h1>
          <p className="text-body-16 text-text-secondary">{t("header.subtitle")}</p>
          <p className="text-label mt-1 text-text-muted">{t("header.roomFloor", { number: roomNumber, floor })}</p>
        </header>

        <div role="status" aria-live="polite" className="empty:hidden">
          {toast && <Banner tone={toastError ? "warning" : "accent"} icon={toastError ? "triangle-alert" : "check"} title={toast} />}
        </div>

        <GuestOfflineBar state={offline} />

        <div className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <ActionTile
              key={tile.kind}
              icon={tile.icon}
              title={tile.title}
              hint={tile.hint}
              ariaLabel={tile.ariaLabel}
              active={tile.active}
              onClick={() => setModal(tile.kind)}
              className={cx("h-full min-h-40", tile.active && "border-2 border-border-accent")}
            />
          ))}
        </div>

        {latest && (
          <button
            type="button"
            onClick={() => setModal("requests")}
            className={cx("glass press flex min-h-(--size-touch-min) w-full items-center gap-3 p-4 text-start", FOCUS_RING)}
          >
            <span className="text-body-16 min-w-0 flex-1 break-words text-text-primary">
              {t("status.latest", { kind: t(`status.kind.${latest.kind}` as GuestTKey) })}
            </span>
            <RequestStatus status={latest.status} />
            <Glyph name="chevron-right" size={20} className="text-text-muted" />
            <span className="sr-only">{t("status.showAll")}</span>
          </button>
        )}

        <MessageForm actionBase={actionBase} offline={offline} onSent={() => announce(t("toast.note"))} />

        {legalLinks && <GuestLegalLinks links={legalLinks} />}
      </main>

      {modal === "dnd" && (
        <DndModal actionBase={actionBase} offline={offline} onClose={() => setModal(null)} onSubmit={() => announce(t("toast.dnd"))} />
      )}
      {modal === "dndCancel" && (
        <DndCancelModal
          actionBase={actionBase}
          offline={offline}
          onClose={() => setModal(null)}
          onSubmit={() => announce(t("toast.dndCancelled"))}
        />
      )}
      {modal === "clean" && (
        <CleanModal actionBase={actionBase} offline={offline} onClose={() => setModal(null)} onSubmit={() => announce(t("toast.clean"))} />
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
    </div>
  );
}

function RequestStatus({ status }: { status: GuestStatusItem["status"] }) {
  const { t } = useGuestLocale();
  const ui = REQUEST_STATUS_UI[status];
  return (
    <span className={cx("text-body-16 inline-flex shrink-0 items-center gap-2 whitespace-nowrap", TONE_FG[ui.tone])}>
      <Glyph name={ui.icon} size={22} />
      {t(`status.${status}` as GuestTKey)}
    </span>
  );
}

function ModalError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-4">
      <Banner tone="warning" title={error} />
    </div>
  );
}

function ConfirmButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  const { t } = useGuestLocale();
  return (
    <Button variant="primary" icon="check" block onClick={onClick} disabled={busy} aria-busy={busy || undefined}>
      {busy ? t("common.sending") : children}
    </Button>
  );
}

/** Auswahl in einem Fenster (Zeitfenster, Zeitpunkt, Abteilung, Kategorie): FilterChip in voller Breite. */
function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <FilterChip active={active} onClick={onClick} className="min-h-14 w-full whitespace-normal rounded-(--glass-radius-md) text-center">
      {children}
    </FilterChip>
  );
}

interface OfflineEnqueue {
  enqueue: (input: { url: string; body: unknown; label: string }) => void;
}

function MessageForm({ actionBase, offline, onSent }: { actionBase: string; offline: OfflineEnqueue; onSent: () => void }) {
  const { t } = useGuestLocale();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy) return;
    if (!body.trim()) {
      setError(t("comment.empty"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`${actionBase}/notes`, { body: { body } });
      setBody("");
      onSent();
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/notes`, body: { body }, label: t("comment.label") });
        setBody("");
        onSent();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Field
        multiline
        rows={3}
        label={t("comment.fieldLabel")}
        placeholder={t("comment.placeholder")}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
        }}
        error={error ?? undefined}
        maxLength={2000}
      />
      <div className="flex-1" />
      <Button type="submit" variant="primary" icon="check" block disabled={busy} aria-busy={busy || undefined}>
        {busy ? t("common.sending") : t("comment.send")}
      </Button>
    </form>
  );
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
          <Choice key={w} active={choice === w} onClick={() => setChoice(w)}>
            {t(`dndWindow.${w}` as GuestTKey)}
          </Choice>
        ))}
      </div>
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("modal.dnd.confirm")}
      </ConfirmButton>
    </GuestModal>
  );
}

/** Rückfrage vor „Bitte nicht stören zurücknehmen“ — ersetzt das frühere `window.confirm` (gleiche Funktion, Glas-Fenster). */
function DndCancelModal({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`${actionBase}/dnd-cancel`, { body: {} });
      onSubmit();
    } catch (e) {
      if (e instanceof NetworkError) {
        offline.enqueue({ url: `${actionBase}/dnd-cancel`, body: {}, label: t("dndActive.cancel") });
        onSubmit();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuestModal title={t("dndActive.cancel")} subtitle={t("dndActive.confirmQuestion")} onClose={onClose}>
      <ModalError error={error} />
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("dndActive.cancel")}
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
      <div className="mb-4 grid gap-2">
        {CLEAN_TIMINGS.map((tm) => (
          <Choice key={tm} active={timing === tm} onClick={() => setTiming(tm)}>
            {tm === "LATER" ? t("modal.clean.laterLabel") : t(`cleanTiming.${tm}` as GuestTKey)}
          </Choice>
        ))}
      </div>
      {timing === "LATER" && (
        <Field
          type="time"
          label={t("cleanTiming.LATER")}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mb-4"
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
      <fieldset className="mb-4">
        <legend className="text-label mb-2 text-text-muted">{t("modal.defect.category")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {DEFECT_CATEGORIES.map((c) => (
            <Choice key={c} active={category === c} onClick={() => setCategory(c)}>
              {t(`defectCategory.${c}` as GuestTKey)}
            </Choice>
          ))}
        </div>
      </fieldset>
      <Field
        multiline
        rows={3}
        label={t("modal.defect.description")}
        placeholder={t("modal.defect.descriptionPlaceholder")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mb-4"
      />
      <Field
        type="file"
        accept="image/*"
        label={t("modal.defect.photo")}
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mb-4"
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
          <Choice key={d.key} active={department === d.key} onClick={() => setDepartment(d.key)}>
            {t(`department.${d.key}` as GuestTKey)}
          </Choice>
        ))}
      </div>
      <ConfirmButton busy={busy} onClick={confirm}>
        {t("modal.contact.submit")}
      </ConfirmButton>
    </GuestModal>
  );
}

function requestItemLabel(t: T, item: GuestStatusItem): string {
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

  return (
    <GuestModal title={t("status.title")} onClose={onClose}>
      {items.length === 0 ? (
        <p className="text-body-16 text-text-secondary">{t("status.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-h-(--size-touch-min) items-center justify-between gap-3 rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-body-16 truncate text-text-primary">{t(`status.kind.${item.kind}` as GuestTKey)}</p>
                <p className="text-label truncate text-text-secondary">{requestItemLabel(t, item)}</p>
              </div>
              <RequestStatus status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </GuestModal>
  );
}
