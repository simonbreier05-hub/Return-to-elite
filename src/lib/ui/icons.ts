/**
 * Symbole des neuen Designs (docs/design/glass-spec.md, Abschnitt 6): Figma-Name → lucide-react.
 * Linien-Symbole, 24-px-Raster, Strichstärke 2. Bausteine und Seiten holen Symbole nur über
 * diese Liste, damit Figma und Code dieselben Namen sprechen.
 */
import {
  ArrowLeft,
  BedSingle,
  Bell,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  House,
  Info,
  List,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Search,
  Shirt,
  Star,
  TriangleAlert,
  User,
  Users,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const ICONS = {
  home: House,
  "bed-single": BedSingle,
  "calendar-days": CalendarDays,
  list: List,
  chart: ChartColumn,
  message: MessageCircle,
  users: Users,
  search: Search,
  bell: Bell,
  check: Check,
  x: X,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "arrow-left": ArrowLeft,
  refresh: RefreshCw,
  "triangle-alert": TriangleAlert,
  star: Star,
  pause: Pause,
  moon: Moon,
  zap: Zap,
  wrench: Wrench,
  shirt: Shirt,
  play: Play,
  "log-in": LogIn,
  "log-out": LogOut,
  clock: Clock,
  circle: Circle,
  info: Info,
  user: User,
  "file-text": FileText,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Strichstärke laut Spezifikation (Abschnitt 6). */
export const ICON_STROKE = 2;
