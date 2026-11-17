/**
 * S1 (Simulation v2, Befund K2): Anmeldung am Live-Kanal.
 *
 * Wird von server.js als Socket.IO-Middleware (`io.use`) genutzt: Eine Verbindung wird nur angenommen, wenn das
 * Sitzungs-Cookie `stayclean_session` gültig ist — dieselbe Prüfung wie `verifySessionToken` in src/lib/auth.ts
 * (HS256, gleiches Geheimnis, Rolle aus der festen Rollenliste). Danach steht die Person fest am Socket
 * (`socket.data.userId/role/name`) und der Socket sitzt in den Räumen `role:<rolle>` und `user:<id>`;
 * src/lib/realtime.ts sendet nur noch an diese Räume. Der Gastbildschirm nutzt den Live-Kanal nie (er fragt
 * `/status` ab).
 *
 * Geheimnis: wie src/lib/auth.ts — AUTH_SECRET, in Entwicklung der Dev-Standard. In Produktion ohne AUTH_SECRET
 * erzeugt `ensureAuthSecret` ein zufälliges Geheimnis für diesen Prozess und setzt es in process.env, bevor Next
 * startet; so prüfen Next und der Live-Kanal mit demselben Schlüssel.
 */
const { randomBytes } = require("crypto");

const COOKIE_NAME = "stayclean_session";
const DEV_SECRET = "dev-secret-change-me-please-0123456789";
const ROLES = ["room_attendant", "supervisor", "front_office", "concierge", "engineering", "houseman", "duty_manager"];

function ensureAuthSecret(env = process.env) {
  const configured = env.AUTH_SECRET;
  if (env.NODE_ENV === "production" && (!configured || configured === DEV_SECRET)) {
    console.warn(
      "[auth] AUTH_SECRET is not set (or still the dev default). Using a random per-boot secret — all sessions are " +
        "invalidated on restart. Set AUTH_SECRET in your environment to keep users logged in across deploys."
    );
    env.AUTH_SECRET = randomBytes(32).toString("hex");
  }
  return env.AUTH_SECRET ?? DEV_SECRET;
}

function readCookie(header, name) {
  if (!header || typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Sitzung aus dem Cookie-Header oder null. */
async function sessionFromCookieHeader(cookieHeader, secret) {
  const token = readCookie(cookieHeader, COOKIE_NAME);
  if (!token) return null;
  try {
    const { jwtVerify } = require("jose");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !ROLES.includes(payload.role)) return null;
    return { userId: payload.sub, role: payload.role, name: String(payload.name ?? ""), exp: typeof payload.exp === "number" ? payload.exp : null };
  } catch {
    return null;
  }
}

/** Socket.IO-Middleware: ohne gültige Sitzung keine Verbindung. */
function socketAuthMiddleware(getSecret) {
  return async (socket, next) => {
    const session = await sessionFromCookieHeader(socket.handshake?.headers?.cookie, getSecret());
    if (!session) return next(new Error("UNAUTHORIZED"));
    socket.data.userId = session.userId;
    socket.data.role = session.role;
    socket.data.name = session.name;
    socket.join([`role:${session.role}`, `user:${session.userId}`]);
    // Läuft die Sitzung ab, endet auch die Live-Verbindung (der Client verbindet sich mit neuer Anmeldung neu).
    if (session.exp) {
      const ms = session.exp * 1000 - Date.now();
      const timer = setTimeout(() => socket.disconnect(true), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
      socket.on("disconnect", () => clearTimeout(timer));
    }
    next();
  };
}

module.exports = { COOKIE_NAME, DEV_SECRET, ROLES, ensureAuthSecret, readCookie, sessionFromCookieHeader, socketAuthMiddleware };
