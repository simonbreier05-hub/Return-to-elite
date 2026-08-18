/**
 * Offline action queue.
 *
 * Housekeeping wifi dies in stairwells, service lifts and the far end of a
 * corridor. Without this, a tap on "mark clean" in a dead spot is simply lost
 * and the attendant does not find out until the supervisor asks.
 *
 * Every write the attendant makes goes through here. If the network fails the
 * action is stored locally and replayed once the connection returns.
 *
 * Deliberately framework-free (storage and transport are injected) so the
 * replay rules can be unit-tested without a browser — see
 * tests/offlineQueue.test.ts.
 *
 * ORDER MATTERS. A room walks DIRTY → IN_PROGRESS → CLEAN; replaying those out
 * of order would be rejected by the state machine. So the flush stops at the
 * first action it cannot deliver instead of skipping ahead.
 */

export interface QueuedAction {
  id: string;
  url: string;
  body: unknown;
  /** What the attendant sees in the pending list, e.g. "Room 214 · Clean". */
  label: string;
  queuedAt: number;
  attempts: number;
}

export type SendResult =
  | { ok: true; data: unknown }
  /**
   * retriable = the request never reached the server (offline, timeout).
   * Anything the server answered — 403, 409, 400 — is final: replaying it
   * would fail again, so it is dropped and reported to the user.
   */
  | { ok: false; retriable: boolean; error: string };

export interface QueueStorage {
  read(): QueuedAction[];
  write(actions: QueuedAction[]): void;
}

export interface QueueDeps {
  storage: QueueStorage;
  send(action: QueuedAction): Promise<SendResult>;
  now?: () => number;
  newId?: () => string;
}

export interface FlushReport {
  delivered: QueuedAction[];
  /** Rejected by the server — these will never succeed and were removed. */
  rejected: { action: QueuedAction; error: string }[];
  /** Still queued because the network is down. */
  remaining: number;
}

export function createActionQueue(deps: QueueDeps) {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const listeners = new Set<(actions: QueuedAction[]) => void>();
  let flushing = false;

  const read = () => deps.storage.read();
  const write = (actions: QueuedAction[]) => {
    deps.storage.write(actions);
    for (const listener of listeners) listener(actions);
  };

  return {
    list: read,

    subscribe(listener: (actions: QueuedAction[]) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    enqueue(input: { url: string; body: unknown; label: string }): QueuedAction {
      const action: QueuedAction = {
        id: newId(),
        url: input.url,
        body: input.body,
        label: input.label,
        queuedAt: now(),
        attempts: 0,
      };
      write([...read(), action]);
      return action;
    },

    /**
     * Deliver what is queued, oldest first. Returns what happened so the UI can
     * tell the attendant which of their taps actually stuck.
     */
    async flush(): Promise<FlushReport> {
      // Guard against a reconnect event and a timer both firing: a double
      // flush would send the same action twice.
      if (flushing) return { delivered: [], rejected: [], remaining: read().length };
      flushing = true;

      const delivered: QueuedAction[] = [];
      const rejected: { action: QueuedAction; error: string }[] = [];

      try {
        let pending = read();
        while (pending.length > 0) {
          const [head, ...rest] = pending;
          const attempted = { ...head, attempts: head.attempts + 1 };
          const result = await deps.send(attempted);

          if (result.ok) {
            delivered.push(attempted);
            pending = rest;
            write(pending);
            continue;
          }

          if (result.retriable) {
            // Still offline. Keep the attempt count, keep the order, stop here.
            pending = [attempted, ...rest];
            write(pending);
            break;
          }

          // The server said no. Retrying cannot help.
          rejected.push({ action: attempted, error: result.error });
          pending = rest;
          write(pending);
        }

        return { delivered, rejected, remaining: read().length };
      } finally {
        flushing = false;
      }
    },

    clear() {
      write([]);
    },
  };
}

export type ActionQueue = ReturnType<typeof createActionQueue>;

/** localStorage-backed storage; falls back to memory where it is unavailable. */
export function browserStorage(key = "stayclean.queue.v1"): QueueStorage {
  let memory: QueuedAction[] = [];
  const available = (() => {
    try {
      if (typeof localStorage === "undefined") return false;
      localStorage.setItem(`${key}.probe`, "1");
      localStorage.removeItem(`${key}.probe`);
      return true;
    } catch {
      return false; // private mode, quota, or no DOM
    }
  })();

  return {
    read() {
      if (!available) return memory;
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
      } catch {
        return [];
      }
    },
    write(actions) {
      if (!available) {
        memory = actions;
        return;
      }
      try {
        localStorage.setItem(key, JSON.stringify(actions));
      } catch {
        memory = actions;
      }
    },
  };
}
