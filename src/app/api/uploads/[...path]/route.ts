import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireAuth } from "@/lib/rbac";

/**
 * GET /api/uploads/<file> — the only way to read a defect photo (DSGVO: not
 * publicly reachable static files, see docs/guest-api.md). Files live in the
 * private ./uploads directory (never under public/); any signed-in staff
 * member may view one, matching how defect photos already surface across
 * every Hub screen (RoomDetailModal, engineering hub) regardless of role.
 */

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { path: segments } = await params;
  // Each segment comes from the URL pre-split on "/", but reject anything
  // that still smuggles a traversal token, then re-verify the resolved path
  // never leaves UPLOADS_DIR — defense in depth, not just the segment check.
  if (segments.length === 0 || segments.some((s) => s === ".." || s === "." || s.includes("/") || s.includes("\\"))) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  const filePath = path.join(UPLOADS_DIR, ...segments);
  if (path.relative(UPLOADS_DIR, filePath).startsWith("..")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ext = (segments[segments.length - 1].split(".").pop() || "").toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
