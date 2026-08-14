/**
 * Custom Next.js server with Socket.IO.
 *
 * - Serves the Next app (dev & prod: `node server.js`).
 * - Attaches a Socket.IO server on the same HTTP port and exposes it as
 *   globalThis.__io so API routes (same process) can broadcast instantly.
 * - Runs the escalation ticker every 60s by calling the internal API route
 *   (keeps all TS/Prisma logic inside the Next bundle).
 */
const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });
  globalThis.__io = io;

  io.on("connection", (socket) => {
    socket.on("hello", (info) => {
      socket.data.user = info || {};
    });
  });

  // Escalation ticker — DND/BLOCKED re-checks, welfare checks, ETA alerts,
  // release-queue backlog. Thresholds live in the Setting table.
  const TICK_MS = 60_000;
  const tick = async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/internal/escalations`, {
        method: "POST",
        headers: { "x-internal-ticker": "1" },
      });
    } catch (err) {
      console.error("[escalations] tick failed:", err.message);
    }
  };
  setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000); // first run shortly after boot

  httpServer.listen(port, hostname, () => {
    console.log(`> Elite Housekeeping ready on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  });
});
