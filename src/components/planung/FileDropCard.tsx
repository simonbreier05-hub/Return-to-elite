"use client";

import type { ReactNode } from "react";
import type { FileStatus } from "@/lib/planung/model";

export interface CardIssue { severity: "CRITICAL" | "WARNING" | "INFO"; message: string }

const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;

/**
 * Eine Listen-Karte: Titel + Untertitel, Status rechts (wartet → liest → gelesen). „liest" zeigt Spinner und Laufbalken
 * (ca. 850 ms je Datei), „gelesen" ein poppendes Häkchen. Befunde stehen als Text mit Symbol.
 */
export default function FileDropCard({
  title, subtitle, status, statusLabel, resultText, issues = [], index = 0, children,
}: { title: string; subtitle: string; status: FileStatus; statusLabel: string; resultText?: string; issues?: CardIssue[]; index?: number; children?: ReactNode }) {
  const tone = status === "error" ? "border-badge-3" : status === "warning" ? "border-brass-light/70" : status === "read" || status === "applied" ? "border-line-2" : "border-line-1";
  return (
    <div className={`pl-rise relative overflow-hidden rounded-[18px] border bg-night-600 px-4 py-3 ${tone}`} style={{ ["--i" as string]: index }} data-status={status}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-pl-muted">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-pl-muted" role="status">
          {status === "reading" && <span className="pl-spin inline-block h-4 w-4 rounded-full border-2 border-line-2 border-t-brass-light" aria-hidden />}
          {(status === "read" || status === "applied") && (
            <svg key={status} className="pl-pop h-4 w-4 text-brass-light" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10.5l4 4 8-9" /></svg>
          )}
          {status === "warning" && <span aria-hidden className="text-brass-light">⚠</span>}
          {status === "error" && <span aria-hidden className="text-badge-2">✖</span>}
          <span className={status === "waiting" ? "" : "font-medium text-pl-text"}>{statusLabel}</span>
        </div>
      </div>
      {status === "reading" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line-1" aria-hidden><div className="pl-run h-full w-1/3 rounded-full bg-brass-light" /></div>
      )}
      {resultText && status !== "waiting" && status !== "reading" && <p className="mt-1.5 text-xs text-pl-muted">{resultText}</p>}
      {issues.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {issues.map((i, k) => <li key={k} className={i.severity === "INFO" ? "text-pl-muted" : "text-brass-light"}><span aria-hidden>{ICON[i.severity]}</span> {i.message}</li>)}
        </ul>
      )}
      {children}
    </div>
  );
}
