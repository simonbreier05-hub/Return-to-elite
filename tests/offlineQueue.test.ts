import { describe, expect, it, vi } from "vitest";
import {
  createActionQueue,
  type QueueStorage,
  type QueuedAction,
  type SendResult,
} from "@/lib/offline/actionQueue";

function memoryStorage(initial: QueuedAction[] = []): QueueStorage {
  let actions = [...initial];
  return {
    read: () => [...actions],
    write: (next) => {
      actions = [...next];
    },
  };
}

/** Scripted transport: each call returns the next result in the list. */
function scriptedSend(results: SendResult[]) {
  const sent: QueuedAction[] = [];
  let i = 0;
  const send = vi.fn(async (action: QueuedAction) => {
    sent.push(action);
    return results[Math.min(i++, results.length - 1)];
  });
  return { send, sent };
}

const ok: SendResult = { ok: true, data: null };
const offline: SendResult = { ok: false, retriable: true, error: "Network unreachable" };
const refused = (error: string): SendResult => ({ ok: false, retriable: false, error });

const queueOf = (storage: QueueStorage, send: (a: QueuedAction) => Promise<SendResult>) =>
  createActionQueue({ storage, send, now: () => 1_000, newId: (() => { let n = 0; return () => `a${++n}`; })() });

describe("offline queue — capturing taps", () => {
  it("stores an action and reports it as pending", () => {
    const storage = memoryStorage();
    const q = queueOf(storage, async () => ok);
    q.enqueue({ url: "/api/rooms/1/status", body: { status: "CLEAN" }, label: "Room 214 · Clean" });

    expect(q.list()).toHaveLength(1);
    expect(q.list()[0].label).toBe("Room 214 · Clean");
    expect(q.list()[0].attempts).toBe(0);
  });

  it("survives a reload — the queue lives in storage, not in memory", () => {
    const storage = memoryStorage();
    queueOf(storage, async () => ok).enqueue({ url: "/u", body: {}, label: "Room 101 · In progress" });

    // A fresh queue over the same storage, as after a page reload.
    const revived = queueOf(storage, async () => ok);
    expect(revived.list()).toHaveLength(1);
    expect(revived.list()[0].label).toBe("Room 101 · In progress");
  });

  it("notifies subscribers so the badge can update", () => {
    const q = queueOf(memoryStorage(), async () => ok);
    const seen: number[] = [];
    q.subscribe((actions) => seen.push(actions.length));
    q.enqueue({ url: "/u", body: {}, label: "one" });
    q.enqueue({ url: "/u", body: {}, label: "two" });
    expect(seen).toEqual([1, 2]);
  });
});

describe("offline queue — replay when the signal returns", () => {
  it("delivers everything and empties the queue", async () => {
    const q = queueOf(memoryStorage(), async () => ok);
    q.enqueue({ url: "/u", body: { status: "IN_PROGRESS" }, label: "Room 214 · Start" });
    q.enqueue({ url: "/u", body: { status: "CLEAN" }, label: "Room 214 · Clean" });

    const report = await q.flush();
    expect(report.delivered).toHaveLength(2);
    expect(report.remaining).toBe(0);
    expect(q.list()).toHaveLength(0);
  });

  it("replays in the order the taps happened", async () => {
    const { send, sent } = scriptedSend([ok, ok, ok]);
    const q = queueOf(memoryStorage(), send);
    q.enqueue({ url: "/u", body: { status: "IN_PROGRESS" }, label: "start" });
    q.enqueue({ url: "/u", body: { status: "CLEAN" }, label: "clean" });
    q.enqueue({ url: "/u", body: { status: "BLOCKED" }, label: "blocked" });

    await q.flush();
    expect(sent.map((a) => a.label)).toEqual(["start", "clean", "blocked"]);
  });

  it("stops at the first action it cannot deliver, keeping the rest in order", async () => {
    // Second call fails: the third must NOT be sent ahead of it, or the state
    // machine would reject the sequence.
    const { send, sent } = scriptedSend([ok, offline]);
    const q = queueOf(memoryStorage(), send);
    q.enqueue({ url: "/u", body: {}, label: "first" });
    q.enqueue({ url: "/u", body: {}, label: "second" });
    q.enqueue({ url: "/u", body: {}, label: "third" });

    const report = await q.flush();
    expect(report.delivered.map((a) => a.label)).toEqual(["first"]);
    expect(sent.map((a) => a.label)).toEqual(["first", "second"]);
    expect(q.list().map((a) => a.label)).toEqual(["second", "third"]);
    expect(report.remaining).toBe(2);
  });

  it("counts attempts so a stuck action can be surfaced", async () => {
    const q = queueOf(memoryStorage(), async () => offline);
    q.enqueue({ url: "/u", body: {}, label: "stuck" });

    await q.flush();
    await q.flush();
    await q.flush();
    expect(q.list()[0].attempts).toBe(3);
  });
});

describe("offline queue — actions the server refuses", () => {
  it("drops a rejected action instead of retrying it forever", async () => {
    const q = queueOf(memoryStorage(), async () => refused("Only a supervisor may release a room."));
    q.enqueue({ url: "/u", body: { status: "INSPECTED" }, label: "Room 205 · Release" });

    const report = await q.flush();
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].error).toMatch(/supervisor/i);
    expect(q.list()).toHaveLength(0);
  });

  it("keeps going after a rejection — one bad tap does not block the shift", async () => {
    const { send, sent } = scriptedSend([refused("Illegal transition DIRTY → INSPECTED."), ok]);
    const q = queueOf(memoryStorage(), send);
    q.enqueue({ url: "/u", body: {}, label: "bad" });
    q.enqueue({ url: "/u", body: {}, label: "good" });

    const report = await q.flush();
    expect(report.rejected.map((r) => r.action.label)).toEqual(["bad"]);
    expect(report.delivered.map((a) => a.label)).toEqual(["good"]);
    expect(sent).toHaveLength(2);
    expect(q.list()).toHaveLength(0);
  });
});

describe("offline queue — concurrency", () => {
  it("does not send the same action twice when two flushes overlap", async () => {
    let resolveFirst: (r: SendResult) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<SendResult>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const q = queueOf(memoryStorage(), send);
    q.enqueue({ url: "/u", body: {}, label: "once" });

    // A reconnect event and the retry timer firing at the same moment.
    const first = q.flush();
    const second = await q.flush();
    expect(second.delivered).toHaveLength(0); // the second call bowed out

    resolveFirst(ok);
    await first;
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.list()).toHaveLength(0);
  });
});
