import { randomBytes } from "crypto";

/**
 * Opaque, cryptographically random identifier — backs both Room.guestAccessCode
 * (NFC/QR) and Stay.stayToken (pre-arrival link). 16 bytes = 128 bit, base64url
 * so it's URL-safe with no padding, per Prompt G2 Teil 2 ("mind. 128 Bit
 * zufällig ... kein Erraten möglich").
 */
export function generateOpaqueToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
