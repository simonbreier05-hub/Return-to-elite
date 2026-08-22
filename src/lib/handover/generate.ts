import { factsToBullets, humanise, type HandoverFacts } from "./collectFacts";

/**
 * Shift handover, part two: turning facts into something readable in 30 seconds.
 *
 * Two providers behind one interface:
 *
 *  - `local` (default, no API key): a deterministic writer. It is NOT a
 *    language model and is never described as one in the UI. It reads well
 *    because the facts are already structured, and it costs nothing, works
 *    offline and produces the same text for the same board.
 *
 *  - `anthropic` (needs ANTHROPIC_API_KEY): a real model, given the same facts
 *    and asked only to phrase them.
 *
 * The important part is what both share: the numbers, room numbers and names
 * come from collectFacts, never from the writer. The model is handed the facts
 * and explicitly told it may not add any. That is what keeps a handover from
 * inventing a blocked room, and it is why the provider can be swapped without
 * changing what is true.
 */

export type HandoverProviderName = "local" | "anthropic";

export interface HandoverResult {
  headline: string;
  body: string;
  bullets: string[];
  provider: HandoverProviderName;
  /** Shown in the UI so nobody mistakes the deterministic writer for a model. */
  providerLabel: string;
  model?: string;
  warning?: string;
}

export function activeProvider(): HandoverProviderName {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "local";
}

// --------------------------------------------------------------------------
// Local, deterministic writer
// --------------------------------------------------------------------------

function pct(f: HandoverFacts) {
  return f.progress.percentReleased;
}

function headlineFor(f: HandoverFacts): string {
  const p = pct(f);
  const open = f.progress.stillDirty + f.progress.inProgress;
  if (f.arrivals.atRisk.length > 0) {
    return `${f.arrivals.atRisk.length} arrival${f.arrivals.atRisk.length === 1 ? "" : "s"} at risk, ${p}% of the house released`;
  }
  if (f.attention.deferred.length > 0) {
    return `${f.attention.deferred.length} room${f.attention.deferred.length === 1 ? "" : "s"} carried over from today's plan, ${p}% released`;
  }
  if (f.progress.waitingForInspection >= 5) {
    return `${f.progress.waitingForInspection} rooms waiting for inspection, ${p}% released`;
  }
  if (open === 0) return `House complete — ${p}% released, nothing outstanding`;
  return `${p}% released, ${open} rooms still open`;
}

function localWriter(f: HandoverFacts): HandoverResult {
  const bullets = factsToBullets(f);
  const p = f.progress;

  const paragraphs: string[] = [];

  paragraphs.push(
    `Handover at ${f.generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, covering the last ${
      f.windowHours
    } hours. ${p.released} of ${p.sellable} sellable rooms are released (${p.percentReleased}%). ` +
      (p.waitingForInspection > 0
        ? `${p.waitingForInspection} are clean and waiting for inspection`
        : `Nothing is waiting for inspection`) +
      `, ${p.inProgress} are being cleaned and ${p.stillDirty} have not been started.`
  );

  const needs: string[] = [];
  if (f.attention.blocked.length) {
    needs.push(
      `${f.attention.blocked.length} blocked room${f.attention.blocked.length === 1 ? "" : "s"} (${f.attention.blocked
        .map((r) => `${r.number}, ${humanise(r.blockReason) || "blocked"} for ${r.minutesInStatus} min`)
        .join("; ")})`
    );
  }
  if (f.attention.rework.length) {
    needs.push(`${f.attention.rework.length} sent back for rework (${f.attention.rework.map((r) => r.number).join(", ")})`);
  }
  if (f.attention.outOfOrder.length) {
    needs.push(`${f.attention.outOfOrder.length} out of order (${f.attention.outOfOrder.map((r) => r.number).join(", ")})`);
  }
  paragraphs.push(
    needs.length > 0
      ? `Needs a decision: ${needs.join(", ")}.`
      : `Nothing is blocked or in rework — the board is clean on that front.`
  );

  if (f.attention.deferred.length > 0) {
    paragraphs.push(
      `Carried over from today's plan (capacity, not forgotten): ${f.attention.deferred
        .map((r) => `${r.number} (${humanise(r.status)}, deferred ${r.deferredMinutesAgo} min ago)`)
        .join(", ")}. These need a spot in tomorrow's plan.`
    );
  }

  if (f.arrivals.expected > 0) {
    let arrivalText = `${f.arrivals.expected} arrivals are expected and ${f.arrivals.readyNow} of their rooms are already released.`;
    if (f.arrivals.atRisk.length) {
      arrivalText += ` Watch ${f.arrivals.atRisk
        .map((a) => `${a.room} for ${a.guest}${a.eta ? ` (ETA ${a.eta})` : ""} — still ${humanise(a.status)}`)
        .join(", ")}.`;
    }
    if (f.arrivals.vipPending.length) {
      arrivalText += ` VIP rooms not yet released: ${f.arrivals.vipPending.map((v) => `${v.room} (${v.guest})`).join(", ")}.`;
    }
    paragraphs.push(arrivalText);
  }

  if (f.engineering.openWorkOrders > 0) {
    paragraphs.push(
      `Engineering has ${f.engineering.openWorkOrders} open work order${
        f.engineering.openWorkOrders === 1 ? "" : "s"
      }${f.engineering.unacknowledged > 0 ? `, ${f.engineering.unacknowledged} still unacknowledged` : ""}: ${f.engineering.open
        .map((w) => `${w.room} ${humanise(w.category)} (${humanise(w.status)})`)
        .join(", ")}.`
    );
  }

  if (f.activity.byAttendant.length) {
    paragraphs.push(
      `Over the shift, ${f.activity.roomsReleasedInWindow} rooms were released across ${f.activity.statusChanges} status changes. ` +
        `Rooms handled: ${f.activity.byAttendant.map((a) => `${a.name} ${a.rooms}`).join(", ")}.` +
        (f.activity.deniedAttempts > 0
          ? ` ${f.activity.deniedAttempts} changes were refused by the system — worth a glance at the audit trail.`
          : "")
    );
  }

  if (f.notes.length) {
    paragraphs.push(
      `Notes left this shift: ${f.notes
        .slice(0, 4)
        .map((n) => `${n.room} — ${n.body} (${n.author})`)
        .join("; ")}.`
    );
  }

  return {
    headline: headlineFor(f),
    body: paragraphs.join("\n\n"),
    bullets,
    provider: "local",
    providerLabel: "Deterministic writer (no language model)",
  };
}

// --------------------------------------------------------------------------
// Anthropic provider
// --------------------------------------------------------------------------

const SYSTEM_PROMPT = `You write shift handover notes for a hotel housekeeping supervisor.

You will be given a list of facts about the current state of the house. Write a
short handover the incoming supervisor can read in about thirty seconds.

Rules:
- Use ONLY the facts given. Never add a room number, a name, a time or a count
  that is not in them. If something is not in the facts, it does not go in the text.
- Lead with what needs a decision, not with what went well.
- Plain professional English, no bullet points, no headings, at most four short
  paragraphs.
- Do not speculate about causes and do not give advice beyond what the facts support.`;

async function anthropicWriter(f: HandoverFacts, apiKey: string): Promise<HandoverResult> {
  const bullets = factsToBullets(f);
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Facts for the handover:\n\n${bullets.map((b) => `- ${b}`).join("\n")}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    // Never leave the supervisor without a handover because a vendor is down.
    const local = localWriter(f);
    return {
      ...local,
      warning: `The language model was unavailable (HTTP ${res.status}); this handover came from the deterministic writer.`,
    };
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    const local = localWriter(f);
    return { ...local, warning: "The language model returned nothing; fell back to the deterministic writer." };
  }

  return {
    headline: headlineFor(f), // computed, not generated — headlines carry numbers
    body: text,
    bullets,
    provider: "anthropic",
    providerLabel: "Language model, phrasing facts computed by the system",
    model,
  };
}

export async function generateHandover(facts: HandoverFacts): Promise<HandoverResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return localWriter(facts);
  try {
    return await anthropicWriter(facts, apiKey);
  } catch (err) {
    const local = localWriter(facts);
    return {
      ...local,
      warning: `Could not reach the language model (${(err as Error).message}); this handover came from the deterministic writer.`,
    };
  }
}

export { localWriter as __localWriterForTests };
