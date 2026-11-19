"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { Banner, Button, Field, GlassCard, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";
import { GlassDialog } from "@/components/shell/GlassDialog";

interface GuestAccessRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  code: string;
}

/**
 * QR/NFC generator (Prompt G2 Teil 2): the table below is the working view
 * (search, copy, regenerate a lost tag's code); /supervisor/guest-access/print
 * is the printable QR sheet (bleibt bewusst hell — für Papier).
 * Simon-Feedback 19.11.2026: im Design der App („Glas & Premium“), alle Texte übersetzt; Rückfrage als Dialog.
 */
export default function GuestAccessView() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<GuestAccessRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [ask, setAsk] = useState<GuestAccessRoom | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    api<{ rooms: GuestAccessRoom[] }>("/api/rooms/guest-access")
      .then((d) => setRooms(d.rooms))
      .catch((e) => setError(errorText(e, t)));
  }, [t]);

  const filtered = useMemo(() => {
    if (!rooms) return [];
    const q = query.trim();
    return q ? rooms.filter((r) => r.number.includes(q)) : rooms;
  }, [rooms, query]);

  const urlFor = (code: string) => `${origin}/g/r/${code}`;

  const copy = async (room: GuestAccessRoom) => {
    try {
      await navigator.clipboard.writeText(urlFor(room.code));
      setCopiedId(room.id);
      setTimeout(() => setCopiedId((id) => (id === room.id ? null : id)), 2000);
    } catch {
      // Zwischenablage nicht verfügbar — die URL bleibt als markierbarer Text in der Zeile.
    }
  };

  const regenerate = async (room: GuestAccessRoom) => {
    setAsk(null);
    if (!rooms) return;
    setBusyId(room.id);
    setError(null);
    try {
      const { code } = await api<{ code: string }>(`/api/rooms/${room.id}/guest-access`, { method: "POST" });
      setRooms((rs) => (rs ?? []).map((r) => (r.id === room.id ? { ...r, code } : r)));
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusyId(null);
    }
  };

  const downloadUrlList = () => {
    if (!rooms) return;
    const lines = rooms.map((r) => `${r.number}\t${urlFor(r.code)}`).join("\n");
    const blob = new Blob([`${t("guestAccess.colRoom")}\tNFC-URL\n${lines}\n`], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "stayclean-guest-nfc-urls.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="theme-glass flex flex-col gap-4 sm:gap-6" data-testid="guest-access">
      <GlassCard as="section" aria-label={t("guestAccess.title")} className="flex flex-col gap-3">
        <SectionLabel as="h2" icon="users" title={t("guestAccess.title")} />
        <p className="text-body-16 max-w-3xl text-text-muted">{t("guestAccess.intro")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field className="sm:w-64" label={t("guestAccess.search")} value={query} inputMode="numeric" onChange={(e) => setQuery(e.target.value)} />
          <Button variant="secondary" icon="file-text" disabled={!rooms} onClick={downloadUrlList}>{t("guestAccess.download")}</Button>
          <Link href="/supervisor/guest-access/print"
            className={cx("press bg-champagne text-body-18 inline-flex min-h-(--size-button-height) items-center justify-center gap-3 rounded-(--glass-radius-md) border border-border-accent px-6 text-text-on-accent", FOCUS_RING)}>
            <Glyph name="list" size={24} />
            {t("guestAccess.print")}
          </Link>
        </div>
      </GlassCard>

      {error && <Banner tone="warning" title={error} />}
      {!rooms && !error && <p className="text-body-16 text-text-muted">{t("common.loading")}</p>}

      {rooms && (
        <GlassCard as="section" aria-label={t("guestAccess.title")} padded={false} className="overflow-x-auto">
          <table className="text-body-16 w-full min-w-[36rem] text-start">
            <thead className="text-label text-text-muted">
              <tr>
                <th className="px-4 py-3 text-start">{t("guestAccess.colRoom")}</th>
                <th className="px-4 py-3 text-start">{t("guestAccess.colFloor")}</th>
                <th className="px-4 py-3 text-start">{t("guestAccess.colUrl")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((room) => (
                <tr key={room.id} className="border-t border-border-subtle text-text-primary">
                  <td className="px-4 py-3 font-semibold">{room.number}</td>
                  <td className="px-4 py-3">{room.floor}</td>
                  <td className="text-label max-w-xs truncate px-4 py-3 font-mono text-text-secondary" title={urlFor(room.code)}>{urlFor(room.code)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" icon={copiedId === room.id ? "check" : "file-text"} onClick={() => void copy(room)}>
                        {copiedId === room.id ? t("guestAccess.copied") : t("guestAccess.copy")}
                      </Button>
                      <Button variant="secondary" icon="refresh" disabled={busyId === room.id} onClick={() => setAsk(room)}>
                        {t("guestAccess.regenerate")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-body-16 p-4 text-text-muted">{t("guestAccess.noRoom")}</p>}
        </GlassCard>
      )}

      <GlassDialog open={!!ask} title={t("guestAccess.regenerateTitle", { n: ask?.number ?? "" })} message={t("guestAccess.regenerateText")}
        confirmLabel={t("guestAccess.regenerate")} confirmIcon="refresh" onCancel={() => setAsk(null)} onConfirm={() => ask && void regenerate(ask)} busy={!!busyId} />
    </div>
  );
}
