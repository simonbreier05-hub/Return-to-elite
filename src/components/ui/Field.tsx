"use client";

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx, FOCUS_RING, Glyph } from "./primitives";

interface FieldBase {
  label: string;
  /** Hilfetext unter dem Feld. */
  hint?: string;
  /** Fehlermeldung (mit Symbol, nie nur rot). */
  error?: string;
  className?: string;
}

export type FieldProps =
  | (FieldBase & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, "className">)
  | (FieldBase & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">);

const FIELD =
  "text-body-16 w-full min-h-(--size-touch-min) rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 py-3 text-text-primary placeholder:text-text-muted disabled:opacity-40";

/** Eingabefeld/Textfeld: Label/14 gedämpft darüber, Feld in `--color-surface-progress-track`, Radius 18, Mindesthöhe 48. */
export function Field(props: FieldProps) {
  const auto = useId();
  const { label, hint, error, className, multiline, id: ownId, ...rest } = props;
  const id = ownId ?? auto;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, className: cx(FIELD, FOCUS_RING, error && "border-status-danger-fg") };
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label text-text-muted">
        {label}
      </label>
      {multiline ? (
        <textarea rows={4} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...common} />
      ) : (
        <input {...(rest as InputHTMLAttributes<HTMLInputElement>)} {...common} />
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-label text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-label flex items-center gap-2 text-status-danger-fg">
          <Glyph name="triangle-alert" size={18} />
          {error}
        </p>
      )}
    </div>
  );
}
