"use client";

/**
 * Shared modal frame. Bottom sheet on phones, centred dialog from `sm` up,
 * with touch targets sized for gloved hands on a tablet.
 *
 * This replaces the browser's window.prompt()/confirm(), which cannot be
 * styled, is easy to mis-tap, and looks out of place in the housekeeping UI.
 */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl leading-tight">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-graphite/60">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 h-11 w-11 shrink-0 rounded-lg text-lg hover:bg-parchment"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
