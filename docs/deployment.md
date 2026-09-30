# Deployment (Railway oder jeder andere Hoster)

Ziel: StayClean läuft ohne Codeänderung auf jedem Hoster, der Docker oder Node 22 + PostgreSQL kann.
**Hier stehen nur Namen von Variablen, nie Werte.**

## 1. Umgebungsvariablen

| Name | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL-Verbindung (`postgresql://USER:PASS@HOST:5432/DB?schema=public`) |
| `AUTH_SECRET` | ja | Signiert Login-Sitzungen. Lang und zufällig (`openssl rand -base64 32`). Fehlt sie, laufen Logins nach jedem Neustart ab |
| `NODE_ENV` | ja | `production` (im Dockerfile schon gesetzt) |
| `PORT` | nein | Standard `3000` |
| `ALLOW_DEV_LOGIN` | nein | `true` schaltet die Passwortprüfung ab. **Nie** bei echten Gästedaten setzen. Der Name muss exakt so großgeschrieben sein |
| `SEED_MODE` | nein | Vom Startbefehl gesetzt (`if-empty`): Beispieldaten nur in eine leere Datenbank |
| `ANTHROPIC_API_KEY` | nein | Ohne Schlüssel erzeugt die Übergabe-Zusammenfassung ihren Text lokal |
| `ANTHROPIC_MODEL` | nein | Modellname für die Übergabe-Zusammenfassung |

Nur Railway (auf anderem Hoster nicht nötig): `NIXPACKS_NODE_VERSION`, `NPM_CONFIG_PRODUCTION`, alle `RAILWAY_*`.

## 2. Build und Start

Ohne Docker (Node 22):

```bash
npm ci                 # installiert alles, was der Build braucht
npm run build:railway  # prisma generate (Postgres) + next build
npm run start:railway  # Schema anlegen/abgleichen, leere DB befüllen, Server starten
```

Wichtig: Alles, was für den Build nötig ist (Tailwind, TypeScript, Typen), steht bewusst unter
`dependencies`. Testwerkzeug (`vitest`) bleibt in `devDependencies`; `tests/` und `vitest.config.ts` sind in `tsconfig.json` vom Build-Typcheck ausgeschlossen. Sonst schlägt der Build fehl, sobald der Hoster `NODE_ENV=production` setzt
(Fehler `Cannot find module '@tailwindcss/postcss'`).

Mit Docker:

```bash
docker build -t stayclean .
docker run -d -p 3000:3000 \
  -e DATABASE_URL -e AUTH_SECRET \
  -v stayclean_uploads:/app/uploads \
  stayclean
```

- Health-Check: `GET /api/health`
- Foto-Ordner `/app/uploads` (Mängel-Fotos) **muss ein persistentes Volume sein**, sonst gehen Fotos bei jedem Neustart verloren.
- Der Server braucht dauerhaft laufende Prozesse (Socket.IO, stündlicher Löschjob) – kein reines Serverless-Hosting.

## 3. Datenbank-Schema (Prisma)

Dieses Projekt nutzt **kein** `prisma migrate` (es gibt keinen Ordner `prisma/migrations`). Der Startbefehl ruft
`scripts/railway-boot.sh` auf. Es zeigt zuerst die geplanten SQL-Änderungen (Warnung `DESTRUCTIVE CHANGE AHEAD`
bei Löschungen) und führt dann aus:

```bash
npx prisma db push --schema prisma/schema.postgres.prisma --skip-generate --accept-data-loss
```

- Bei jedem Start ausgeführt, auch bei einem reinen Neustart.
- Zwei Dienste dürfen **nie** dieselbe Datenbank nutzen (Spalten können still gelöscht werden).
- Schemaänderungen immer in `schema.prisma` **und** `schema.postgres.prisma`.

## 4. Backup und Restore (pg_dump / pg_restore)

Vor jedem Umzug und regelmäßig sichern. `DATABASE_URL` ohne den Zusatz `?schema=public` verwenden, falls `pg_dump` ihn nicht akzeptiert.

```bash
# Backup (komprimiertes Custom-Format)
pg_dump --format=custom --no-owner --no-acl --file=stayclean-$(date +%F).dump "$DATABASE_URL"

# Restore in eine LEERE Zieldatenbank
pg_restore --no-owner --no-acl --clean --if-exists --dbname="$NEW_DATABASE_URL" stayclean-2026-01-01.dump
```

Zusätzlich das Volume `/app/uploads` sichern (z. B. `tar czf uploads.tgz uploads/`).

## 5. Umzug auf einen anderen Hoster

1. Backup der Datenbank + Uploads (Abschnitt 4).
2. Neue PostgreSQL-Datenbank anlegen, mit `pg_restore` einspielen.
3. Container starten (Abschnitt 2) mit neuer `DATABASE_URL` und **derselben** `AUTH_SECRET` (sonst müssen sich alle neu anmelden).
4. Uploads in das Volume `/app/uploads` kopieren.
5. `/api/health` prüfen, Domain umstellen.
