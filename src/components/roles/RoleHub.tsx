"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { IconName } from "@/lib/ui/icons";
import { Banner, Button, FilterChip, GlassCard, Glyph, KpiTile, KpiTileCompact, ListRow, ListRowCompact, type PillData } from "@/components/ui";
import { cx } from "@/components/ui/primitives";
import { useBreakpoint } from "@/components/shell/useBreakpoint";

export interface RoleKpi {
  key: string;
  label: string;
  value: number | string;
  icon: IconName;
  /** Warmer Lichtreflex nur bei Handlungsbedarf. */
  warm?: boolean;
}

export interface RoleFilter {
  id: string;
  label: string;
  count: number;
}

export interface RoleRow {
  key: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  pill?: PillData;
  /** Rechte Angabe (Uhrzeit). Am Handy hängt sie an die Unterzeile an. */
  meta?: string;
  done?: boolean;
}

export interface RoleHubProps {
  /** Für Tests/Playwright, z. B. `engineering-hub`. */
  testId: string;
  kpis: RoleKpi[];
  listTitle: string;
  listIcon: IconName;
  /** Knopf rechts neben dem Listentitel (z. B. „Neue Anreise“). */
  listAction?: ReactNode;
  filters?: RoleFilter[];
  activeFilter?: string;
  onFilter?: (id: string) => void;
  /** Zweite Filterreihe (z. B. Etagen). */
  extraFilters?: ReactNode;
  rows: RoleRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Das Detail (`DetailContainer`): ab 1280 Panel in der Spalte, darunter Einschub/Sheet. */
  detail: ReactNode;
  detailOpen: boolean;
  /** Hinweise über der Liste (Tagesplan fehlt, Dringend-Leiste, Meldungen). */
  notices?: ReactNode;
  /** Zustand der Daten: noch nicht geladen / Fehler beim Laden. */
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  /** Text, wenn die (gefilterte) Liste leer ist. */
  emptyText: string;
  selectHint: string;
  below?: ReactNode;
}

/**
 * Seitenaufbau der Rollen-Hubs Techniker / Hausmann / Front Office / Concierge (Figma `36:1351`, `36:1589`,
 * `36:1839`, `36:2108`, Handy `41:2654`): Kennzahlen, Glas-Karte mit Titel, Filtern und `ListRow`-Liste,
 * ab 1280 px Detail rechts. Reine Darstellung — Daten, Auswahl und Aktionen kommen vom Aufrufer.
 */
export function RoleHub(p: RoleHubProps) {
  const { t } = useLocale();
  const bp = useBreakpoint() ?? "tablet";
  const phone = bp === "phone";

  // Solange nichts geladen ist (oder Laden fehlschlug), keine erfundenen Nullen zeigen.
  const kpis = p.loading || p.loadError ? p.kpis.map((k) => ({ ...k, value: "–", warm: false })) : p.kpis;
  const kpiBlock = phone ? (
    <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1" role="list" aria-label={p.listTitle}>
      {kpis.map((k) => (
        <div role="listitem" key={k.key} className="w-[171px] shrink-0 snap-start">
          <KpiTileCompact label={k.label} value={k.value} icon={k.icon} tone={k.warm ? "attention" : "default"} />
        </div>
      ))}
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((k) => (
        <KpiTile key={k.key} label={k.label} value={k.value} icon={k.icon} tone={k.warm ? "attention" : "default"} />
      ))}
    </div>
  );

  const state = (r: RoleRow) => (p.selectedKey === r.key ? "selected" : r.done ? "done" : "default");

  let body: ReactNode;
  if (p.loading) {
    body = (
      <p role="status" className="text-body-16 flex items-center gap-3 py-6 text-text-secondary" data-testid="role-loading">
        <Glyph name="clock" size={24} className="text-text-muted" />
        {t("common.loading")}
      </p>
    );
  } else if (p.loadError) {
    body = (
      <div role="alert" className="flex flex-col gap-3" data-testid="role-error">
        <Banner tone="warning" icon="triangle-alert" title={t("roleHub.loadError")} detail={p.loadError} />
        {p.onRetry && (
          <Button variant="secondary" icon="refresh" onClick={p.onRetry} className="self-start">
            {t("roleHub.retry")}
          </Button>
        )}
      </div>
    );
  } else if (p.rows.length === 0) {
    body = (
      <p className="text-body-16 flex items-center gap-3 py-6 text-text-secondary" data-testid="role-empty">
        <Glyph name={p.listIcon} size={24} className="text-text-muted" />
        {p.emptyText}
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-1">
        {p.rows.map((r) => (
          <li key={r.key} data-row={r.key}>
            {phone ? (
              <ListRowCompact
                icon={r.icon}
                title={r.title}
                subtitle={[r.subtitle, r.meta].filter(Boolean).join(" · ") || undefined}
                pill={r.pill}
                state={state(r)}
                onClick={() => p.onSelect(r.key)}
                className="animate-in-up"
              />
            ) : (
              <ListRow icon={r.icon} title={r.title} subtitle={r.subtitle} pill={r.pill} meta={r.meta} state={state(r)} onClick={() => p.onSelect(r.key)} className="animate-in-up" />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={p.testId}>
      {kpiBlock}
      {p.notices}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_348px] xl:items-start xl:gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          <GlassCard as="section" aria-label={p.listTitle} padded={false} className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-title-22 text-text-primary">{p.listTitle}</h2>
              {p.listAction}
            </div>
            {p.filters && p.filters.length > 1 && !p.loading && !p.loadError && (
              <div className={cx("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:flex-wrap sm:px-6")} role="group" aria-label={t("hkHub.filter")}>
                {p.filters.map((f) => (
                  <FilterChip key={f.id} active={p.activeFilter === f.id} onClick={() => p.onFilter?.(f.id)}>
                    {t("hkHub.withCount", { label: f.label, n: f.count })}
                  </FilterChip>
                ))}
              </div>
            )}
            {!p.loading && !p.loadError && p.extraFilters}
            {body}
          </GlassCard>
          {p.below}
        </div>
        <div>
          {!p.detailOpen && (
            <GlassCard className="hidden flex-col items-center gap-3 py-10 text-center xl:flex">
              <Glyph name={p.listIcon} size={32} className="text-text-muted" />
              <p className="text-body-16 text-text-secondary">{p.selectHint}</p>
            </GlassCard>
          )}
          {p.detail}
        </div>
      </div>
    </div>
  );
}

/**
 * Detail-Panel ab 1280 px so hoch, dass es neben der Liste in den Bildschirm passt (Kopf + Kennzahlen ≈ 17,5 rem):
 * der Hauptknopf unten bleibt sichtbar, der Inhalt scrollt im Panel (Figma `36:1351`, `36:1589`).
 */
export const DETAIL_FIT = "xl:max-h-[calc(100dvh-17.5rem)] xl:min-h-[26rem]";

/** Eine Angabe im Detail: Symbol + Text (Figma: „Licht im Bad defekt“, „Gemeldet um 08:12 Uhr“). */
export function DetailLine({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="text-body-16 flex items-start gap-3 text-text-primary">
      <Glyph name={icon} size={22} className="mt-px shrink-0 text-text-secondary" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
