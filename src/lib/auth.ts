import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { RoleSchema, type Role } from "./domain";

/**
 * Minimal JWT session auth (credentials login, httpOnly cookie).
 * The role inside the token is what every API route authorizes against —
 * RBAC is enforced server-side, never trusted from the client.
 */

const COOKIE_NAME = "elite_session";
const DEV_SECRET = "dev-secret-change-me-please-0123456789";

/**
 * Session signing key. In production the well-known dev secret must never be
 * used — anyone could forge a session token with it. If no AUTH_SECRET is
 * configured there, fall back to a random per-boot key: still safe, but
 * sessions do not survive a restart, so set AUTH_SECRET on any real deploy.
 */
let resolvedSecret: Uint8Array | null = null;

function secret(): Uint8Array {
  if (resolvedSecret) return resolvedSecret;
  const configured = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured === DEV_SECRET)) {
    console.warn(
      "[auth] AUTH_SECRET is not set (or still the dev default). Using a random " +
        "per-boot secret — all sessions are invalidated on restart. Set AUTH_SECRET " +
        "in your environment to keep users logged in across deploys."
    );
    resolvedSecret = crypto.getRandomValues(new Uint8Array(32));
  } else {
    resolvedSecret = new TextEncoder().encode(configured ?? DEV_SECRET);
  }
  return resolvedSecret;
}

export interface Session {
  userId: string;
  name: string;
  role: Role;
}

export async function createSessionToken(session: Session): Promise<string> {
  return await new SignJWT({ name: session.name, role: session.role })
    .setSubject(session.userId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = RoleSchema.parse(payload.role);
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub, name: String(payload.name ?? ""), role };
  } catch {
    return null;
  }
}

/** Read the session from the request cookie (server components & routes). */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const SESSION_COOKIE = COOKIE_NAME;
