import { HEADER_PHOTO_SIZE, HEADER_PHOTO_URL } from "@/lib/branding";

/**
 * Kopf-Foto (Spezifikation Abschnitt 3): schmaler Streifen oben rechts, 150 px hoch, links/rechts und
 * nach unten weich ausgeblendet; darunter/daneben der Himmel-Verlauf. Das Foto wird nie breiter als
 * seine Originalbreite (701 px) gezeigt — breitere Flächen füllt `--sky`. Ohne Foto nur der Himmel.
 */
export function HeaderPhoto() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[190px] overflow-hidden">
      <div className="bg-sky absolute -top-12 end-0 h-[200px] w-[min(400px,60%)] opacity-70" />
      {HEADER_PHOTO_URL && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={HEADER_PHOTO_URL}
          alt=""
          loading="lazy"
          width={HEADER_PHOTO_SIZE.width}
          height={HEADER_PHOTO_SIZE.height}
          className="header-photo-mask absolute top-0 end-0 h-[150px] w-full max-w-[650px] object-cover object-[50%_30%] opacity-55 sm:end-[10%] xl:end-[20%]"
        />
      )}
    </div>
  );
}
