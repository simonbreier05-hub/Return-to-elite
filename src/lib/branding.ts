/**
 * Hotel-Branding des Designs „Glas & Premium“ (docs/design/glass-spec.md, Abschnitt 1 und 3).
 *
 * Kopf-Foto: freigegebenes Foto Hotel de Rome (701×394, WebP, ca. 53 KB). Nur im Kopf und unten in
 * der Seitenleiste (Wide), weich ausgeblendet, nie hochskalieren — breitere Flächen füllt `--sky`.
 * `null` = kein Foto, dann nur der Himmel-Verlauf.
 *
 * Pro Hotel einstellbar machen (Setting `branding.headerPhoto` über src/lib/settings.ts) ist ein
 * späterer Schritt; bis dahin gilt dieser Standard. Bildrechte vor dem Produktivstart klären.
 */
export const HEADER_PHOTO_URL: string | null = "/branding/hotel-de-rome-header.webp";
export const HEADER_PHOTO_SIZE = { width: 701, height: 394 } as const;
