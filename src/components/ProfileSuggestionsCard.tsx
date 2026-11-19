"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import { Button, GlassCard, SectionLabel } from "@/components/ui";
import { GlassDialog } from "@/components/shell/GlassDialog";
import type { ProfileItem } from "@/lib/guest/profileSuggestion";

interface Suggestion { id: string; roomNumber: string; departure: string; guest: string | null; nameHidden?: boolean; items: ProfileItem[] }

/**
 * F8: Kachel „Opera-Profil-Vorschläge (N)“ — nur Duty Manager. Je abgereistem Aufenthalt eine kurze Liste regelbasierter
 * Beobachtungen; der DM pflegt sie von Hand in Opera und hakt ab („in Opera übernommen“) oder verwirft. StayClean schreibt
 * nie nach Opera. Daten nur über die geschützte API (kein Live-Ereignis mit Gastnamen); neu laden bei app:resync.
 */
export default function ProfileSuggestionsCard() {
  const { t, intl } = useLocale();
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Simon 19.11.: nach 24 Uhr am Abreisetag Name nur über den Notfallzugriff (Rückfrage, Logbuch); nur in dieser Ansicht gehalten
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [askReveal, setAskReveal] = useState<string | null>(null);
  const reveal = async (id: string) => {
    setAskReveal(null); setBusy(id);
    try { const r = await api<{ guest: string }>(`/api/profile-suggestions/${id}/reveal`, { body: {} }); setRevealed((m) => ({ ...m, [id]: r.guest })); }
    catch (e) { setError(errorText(e, t)); await load(); }
    finally { setBusy(null); }
  };

  const load = useCallback(async () => {
    try {
      const d = await api<{ suggestions: Suggestion[] }>("/api/profile-suggestions");
      setRows(Array.isArray(d.suggestions) ? d.suggestions : []);
      setError(null);
    } catch (e) {
      setError(errorText(e, t));
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  useSocket({ "app:resync": () => void load() });

  const act = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    try { await api(`/api/profile-suggestions/${id}`, { method: "PATCH", body }); await load(); }
    catch (e) { setError(errorText(e, t)); }
    finally { setBusy(null); }
  };

  if (!rows?.length && !error) return null;
  const itemText = (it: ProfileItem) => t(`profile.item.${it.code}` as TKey, it.vars ?? {});
  return (
    <GlassCard as="section" aria-labelledby="profile-title" className="flex flex-col gap-3" data-testid="profile-suggestions">
      <SectionLabel as="h2" icon="users" title={t("profile.title", { n: rows?.length ?? 0 })} />
      <p className="text-label text-text-muted">{t("profile.hint")}</p>
      {error && <p role="alert" className="text-body-16 text-text-secondary">{error}</p>}
      <ul className="flex flex-col gap-4">
        {(rows ?? []).map((s) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-(--glass-radius-sm) bg-surface-card-raised p-3">
            <p className="text-body-18 text-text-primary">
              {[s.guest ?? revealed[s.id] ?? t("profile.guestUnknown"), t("profile.departure", { date: new Date(s.departure).toLocaleDateString(intl, { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }) }), t("profile.room", { n: s.roomNumber })].join(" · ")}
            </p>
            {s.nameHidden && !revealed[s.id] && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label min-w-0 flex-1 text-text-muted">{t("profile.nameHiddenHint")}</span>
                <Button variant="secondary" icon="user" disabled={busy === s.id} onClick={() => setAskReveal(s.id)}>{t("profile.revealName")}</Button>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {s.items.map((it, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className={`text-body-16 min-w-0 flex-1 ${it.status === "OPEN" ? "text-text-primary" : "text-text-muted line-through"}`}>{itemText(it)}</span>
                  {it.status === "OPEN" && (
                    <>
                      <Button icon="check" disabled={busy === s.id} onClick={() => void act(s.id, { index: i, status: "TAKEN" })}>{t("profile.taken")}</Button>
                      <Button variant="secondary" icon="x" disabled={busy === s.id} onClick={() => void act(s.id, { index: i, status: "DISCARDED" })}>{t("profile.discard")}</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <Button variant="secondary" icon="check" disabled={busy === s.id} onClick={() => void act(s.id, { all: true })}>{t("profile.allDone")}</Button>
          </li>
        ))}
      </ul>
      <GlassDialog open={!!askReveal} title={t("profile.revealConfirmTitle")} message={t("profile.revealConfirmText")}
        confirmLabel={t("profile.revealName")} onCancel={() => setAskReveal(null)} onConfirm={() => askReveal && void reveal(askReveal)} busy={!!busy} />
    </GlassCard>
  );
}
