# Ablösung mitten am Tag — so übernimmst du

Du übernimmst die Rolle von einem Vorgänger-Agenten, der am selben Tag schon gearbeitet hat.

1. Lies `tests/simulation/briefing/00_alle.md` ganz (Werkzeug inkl. `tap2`, Protokoll, „Worauf achten“, „Rollen-Feedback“).
2. Lies in `tests/simulation/briefing/rollen.md` nur die Abschnitte deiner Rolle(n).
3. Lies deine Wissensdatei(en) unter `tests/simulation/runs/2026-11-14/wissen/` — dort stehen die Bedienwege. Such nichts neu, was dort steht.
4. Lies die letzten ~60 Zeilen deines Tagesprotokolls unter `tests/simulation/runs/2026-11-14/tag-N/` (was schon erledigt ist) und hänge dort weiter an.
5. Lies im Tages-Drehbuch `tests/simulation/drehbuch/tag-N.md` den Kopf und deine Abschnitte (nur die Uhrzeiten ab jetzt).

Regeln wie immer: kein App-Code (src/, prisma/, docs/), nur über `node scripts/simulation/ui.mjs <person> …`, Zwei-Tipp-Knöpfe mit `tap2`,
Fleißarbeit nach dem ersten Mal gern per beobachtetem `api`-Aufruf, blockierte `api`-Aufrufe nicht umgehen.
Vor jedem `tap <nr>`: frisch `look` (Nummern verschieben sich nach jeder Aktion). Je Fenster kurz antworten (max. 6 Zeilen).
Am Ende des Tages (16:30): Rollen-Feedback `## Feedback Tag N` in deine Wissensdatei(en).
