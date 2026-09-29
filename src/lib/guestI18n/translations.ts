/**
 * Translation dictionary for the guest screen only (src/components/guest,
 * src/app/g/**) — deliberately separate from src/lib/i18n/translations.ts
 * (the staff Hub's dictionary): different audience, different strings, and
 * Teil 1's "strictly separate" guest area applies to this too. `en` is the
 * canonical shape; `de` is type-checked against it (via `satisfies`) so a
 * missing translation is a compile error, not a silent English leak. Add a
 * third language by adding one more object here and to GUEST_LOCALES below
 * — nothing else needs to change.
 */

export const GUEST_LOCALES = ["de", "en"] as const;
export type GuestLocale = (typeof GUEST_LOCALES)[number];

export function isGuestLocale(value: string): value is GuestLocale {
  return (GUEST_LOCALES as readonly string[]).includes(value);
}

const en = {
  header: {
    room: "ROOM {{number}}",
    floor: "Floor {{floor}}",
  },
  tiles: {
    dnd: { title: "Do Not Disturb", hint: "Choose a time window" },
    clean: { title: "Clean now", hint: "Choose a time" },
    defect: { title: "Report an issue", hint: "Category & description" },
    contact: { title: "Contact a department", hint: "Choose who to reach" },
  },
  dndActive: {
    banner: "Do Not Disturb is active",
    cancel: "Lift Do Not Disturb",
  },
  dndWindow: {
    NOW: "Now",
    TWO_HOURS: "Next 2 hours",
    MORNING: "All morning",
    UNTIL_FURTHER: "Until further notice",
  },
  cleanTiming: {
    NOW: "Right away",
    IN_30: "In 30 minutes",
    LATER: "Later today",
  },
  defectCategory: {
    PLUMBING: "Plumbing",
    ELECTRICAL: "Electrical",
    HVAC: "AC / Heating",
    FURNITURE: "Furniture",
    IT_TV: "TV / Internet",
    MINIBAR: "Minibar",
    OTHER: "Other",
  },
  department: {
    housekeeping: "Housekeeping",
    room_service: "Room Service",
    concierge: "Concierge",
    engineering: "Engineering",
  },
  modal: {
    dnd: { title: "Do Not Disturb", subtitle: "How long should nobody come in?", confirm: "Confirm" },
    clean: {
      title: "Clean now",
      subtitle: "When may we clean your room?",
      confirm: "Confirm",
      laterLabel: "Later today – choose a time",
    },
    defect: {
      title: "Report an issue",
      subtitle: "Goes straight to our technical team.",
      category: "Category",
      description: "Description (optional)",
      descriptionPlaceholder: "What's the problem?",
      photo: "Photo (optional)",
      submit: "Report",
    },
    contact: { title: "Contact a department", subtitle: "Who should reach out to you?", submit: "Contact" },
  },
  toast: {
    dnd: "Noted — Do Not Disturb.",
    dndCancelled: "Do Not Disturb lifted.",
    clean: "Your cleaning request has been sent.",
    defect: "Thank you — forwarded to our technical team.",
    contact: "{{department}} has been notified.",
    note: "Thank you! Your message has been sent to Housekeeping.",
  },
  comment: {
    label: "Message to Housekeeping (optional)",
    placeholder: "Your message…",
    send: "Send",
  },
  status: {
    title: "Your requests",
    RECEIVED: "Received",
    IN_PROGRESS: "In progress",
    DONE: "Done",
    CANCELLED: "Cancelled",
    kind: {
      DND: "Do Not Disturb",
      CLEAN_REQUEST: "Cleaning request",
      CONTACT: "Department contact",
      DEFECT: "Reported issue",
      NOTE: "Message",
    },
  },
  error: {
    generic: "Sorry, that didn't work.",
  },
  offline: {
    noConnection: "No connection",
    canKeepWorking: "You can keep tapping — we'll send it once you're back online.",
    sending: "Sending",
    actionWaiting: "request waiting",
    actionsWaiting: "requests waiting",
    savedLocally: "Saved on this device.",
    tryNow: "Try now",
    oneRejected: "1 request could not be sent",
    nRejected: "{{count}} requests could not be sent",
    mayHaveChanged: "Please try again from the start.",
  },
  unavailable: {
    title: "Not available right now",
    message: "We couldn't find a current stay for this link. Please contact the front desk.",
  },
  language: {
    de: "DE",
    en: "EN",
  },
  common: {
    close: "Close",
  },
} as const;

const de = {
  header: {
    room: "ZIMMER {{number}}",
    floor: "Etage {{floor}}",
  },
  tiles: {
    dnd: { title: "Bitte nicht stören", hint: "Zeitfenster wählen" },
    clean: { title: "Jetzt reinigen", hint: "Zeitpunkt wählen" },
    defect: { title: "Mangel melden", hint: "Kategorie & Beschreibung" },
    contact: { title: "Abteilung kontaktieren", hint: "Zuständige Stelle wählen" },
  },
  dndActive: {
    banner: "Bitte nicht stören ist aktiv",
    cancel: "Bitte nicht stören zurücknehmen",
  },
  dndWindow: {
    NOW: "Jetzt",
    TWO_HOURS: "Nächste 2 Stunden",
    MORNING: "Ganzer Vormittag",
    UNTIL_FURTHER: "Bis auf Weiteres",
  },
  cleanTiming: {
    NOW: "Sofort",
    IN_30: "In 30 Minuten",
    LATER: "Später heute",
  },
  defectCategory: {
    PLUMBING: "Bad / Wasser",
    ELECTRICAL: "Elektrik",
    HVAC: "Klima / Heizung",
    FURNITURE: "Möbel",
    IT_TV: "TV / Internet",
    MINIBAR: "Minibar",
    OTHER: "Sonstiges",
  },
  department: {
    housekeeping: "Housekeeping",
    room_service: "Zimmerservice",
    concierge: "Concierge",
    engineering: "Technik",
  },
  modal: {
    dnd: { title: "Bitte nicht stören", subtitle: "Wie lange soll niemand ins Zimmer kommen?", confirm: "Bestätigen" },
    clean: {
      title: "Jetzt reinigen",
      subtitle: "Wann dürfen wir Ihr Zimmer reinigen?",
      confirm: "Bestätigen",
      laterLabel: "Später heute – Uhrzeit wählen",
    },
    defect: {
      title: "Mangel melden",
      subtitle: "Wird direkt an die Technik weitergeleitet.",
      category: "Kategorie",
      description: "Beschreibung (optional)",
      descriptionPlaceholder: "Was ist das Problem?",
      photo: "Foto (optional)",
      submit: "Melden",
    },
    contact: { title: "Abteilung kontaktieren", subtitle: "Wer soll sich bei Ihnen melden?", submit: "Kontaktieren" },
  },
  toast: {
    dnd: "Wird notiert — bitte nicht stören.",
    dndCancelled: "Bitte nicht stören wurde zurückgenommen.",
    clean: "Ihr Reinigungswunsch wurde übermittelt.",
    defect: "Vielen Dank — die Meldung wurde weitergeleitet.",
    contact: "{{department}} wurde benachrichtigt.",
    note: "Danke! Ihre Nachricht wurde an das Housekeeping übermittelt.",
  },
  comment: {
    label: "Nachricht an das Housekeeping (optional)",
    placeholder: "Ihre Nachricht…",
    send: "Senden",
  },
  status: {
    title: "Ihre Anfragen",
    RECEIVED: "Eingegangen",
    IN_PROGRESS: "In Bearbeitung",
    DONE: "Erledigt",
    CANCELLED: "Zurückgenommen",
    kind: {
      DND: "Bitte nicht stören",
      CLEAN_REQUEST: "Reinigungswunsch",
      CONTACT: "Abteilungskontakt",
      DEFECT: "Gemeldeter Mangel",
      NOTE: "Nachricht",
    },
  },
  error: {
    generic: "Das hat leider nicht geklappt.",
  },
  offline: {
    noConnection: "Keine Verbindung",
    canKeepWorking: "Sie können weiter tippen — wir senden es, sobald Sie wieder online sind.",
    sending: "Wird gesendet",
    actionWaiting: "Anfrage wartet",
    actionsWaiting: "Anfragen warten",
    savedLocally: "Auf diesem Gerät gespeichert.",
    tryNow: "Jetzt erneut versuchen",
    oneRejected: "1 Anfrage konnte nicht gesendet werden",
    nRejected: "{{count}} Anfragen konnten nicht gesendet werden",
    mayHaveChanged: "Bitte versuchen Sie es noch einmal von vorn.",
  },
  unavailable: {
    title: "Zurzeit nicht verfügbar",
    message: "Für diesen Zugang finden wir gerade keinen Aufenthalt. Bitte wenden Sie sich an die Rezeption.",
  },
  language: {
    de: "DE",
    en: "EN",
  },
  common: {
    close: "Schließen",
  },
} satisfies Widen<typeof en>;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
type Dict = Widen<typeof en>;

type Join<K extends string | number, P extends string> = P extends "" ? `${K}` : `${K}.${P}`;
type Paths<T> = T extends string
  ? ""
  : { [K in keyof T & (string | number)]: Join<K, Paths<T[K]>> }[keyof T & (string | number)];
export type GuestTKey = Paths<Dict>;

const dictionaries = { en, de } satisfies Record<GuestLocale, Dict>;

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function translateGuest(locale: GuestLocale, key: GuestTKey, vars?: Record<string, string | number>): string {
  const raw = getPath(dictionaries[locale], key);
  let str = typeof raw === "string" ? raw : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{{${k}}}`).join(String(v));
    }
  }
  return str;
}
