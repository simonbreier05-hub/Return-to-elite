"use client";

import type { ReactNode } from "react";
import type { FileStatus } from "@/lib/planung/model";
import { Pill } from "@/components/ui";

export interface CardIssue { severity: "CRITICAL" | "WARNING" | "INFO"; message: string }

const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;

/**
 * Eine Listen-Karte: Titel + Untertitel, Status rechts (wartet → liest → gelesen). „liest" zeigt Spinner und Laufbalken
 * (ca. 850 ms je Datei), „gelesen" ein poppendes Häkchen. Befunde stehen als Text mit Symbol.
 */
export default function FileDropCard({
  title, subtitle, status, statusLabel, resultText, issues = [], index = 0, children,
}: { title: string; subtitle: string; status: FileStatus; statusLabel: string; resultText?: string; issues?: CardIssue[]; index?: number; children?: ReactNode }) {
  const tone = status === "error" ? "danger" : status === "warning" ? "warning" : status === "read" || status === "applied" ? "success" : "neutral";
  return (
    <div className="glass pl-rise relative overflow-hidden rounded-(--glass-radius-md) px-4 py-3" style={{ ["--i" as string]: index }} data-status={status}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-body-18 truncate text-text-primary">{title}</div>
          <div className="text-label truncate text-text-muted">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2" role="status">
          {status === "reading" && <span className="pl-spin inline-block h-4 w-4 rounded-full border-2 border-border-subtle border-t-accent-default" aria-hidden />}
          {(status === "read" || status === "applied") && (
            <svg key={status} className="pl-pop h-4 w-4 text-status-success-fg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10.5l4 4 8-9" /></svg>
          )}
          {status === "warning" && <span aria-hidden className="text-status-warning-fg">⚠</span>}
          {status === "error" && <span aria-hidden className="text-status-danger-fg">✖</span>}
          <Pill tone={tone}>{statusLabel}</Pill>
        </div>
      </div>
      {status === "reading" && (
        <div className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-progress-track" aria-hidden><div className="pl-run bg-champagne h-full w-1/3 rounded-pill" /></div>
      )}
      {resultText && status !== "waiting" && status !== "reading" && <p className="text-label mt-1.5 text-text-muted">{resultText}</p>}
      {issues.length > 0 && (
        <ul className="text-label mt-1.5 space-y-0.5">
          {issues.map((i, k) => <li key={k} className={i.severity === "INFO" ? "text-text-muted" : "text-status-warning-fg"}><span aria-hidden>{ICON[i.severity]}</span> {i.message}</li>)}
        </ul>
      )}
      {children}
    </div>
  );
}
