import type { IconName } from "@/lib/ui/icons";
import { cx, Glyph, TONE_BG, TONE_FG } from "./primitives";

export type BannerTone = "accent" | "info" | "warning";

const DEFAULT_ICON: Record<BannerTone, IconName> = { accent: "star", info: "info", warning: "triangle-alert" };

export interface BannerProps {
  tone?: BannerTone;
  title: string;
  detail?: string;
  icon?: IconName;
  className?: string;
}

/** Hinweis „Heute im Fokus“ (frühe Anreisen, VIP, Sonderreinigung): Titel + Detail + Symbol. Figma `21:80`. */
export function Banner({ tone = "info", title, detail, icon, className }: BannerProps) {
  return (
    <div role="note" className={cx("flex items-start gap-4 rounded-(--glass-radius-md) px-4 py-3", TONE_BG[tone], className)}>
      <Glyph name={icon ?? DEFAULT_ICON[tone]} size={24} className={cx("mt-px", TONE_FG[tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-body-18 text-text-primary">{title}</p>
        {detail && <p className="text-body-16 text-text-secondary">{detail}</p>}
      </div>
    </div>
  );
}
