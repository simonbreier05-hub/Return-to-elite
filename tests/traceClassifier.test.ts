import { describe, expect, it } from "vitest";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import { TRACES_SAMPLE } from "./fixtures/opera/tracesSample";

describe("classifyTraceText", () => {
  it.each(TRACES_SAMPLE.filter((t) => !t.resolved))("Zimmer $room: $text", (row) => {
    expect(classifyTraceText(row.text)).toEqual(row.expect);
  });

  it("erkennt Twin-Aufbau und -Rückbau getrennt", () => {
    expect(classifyTraceText("Twin bed please")?.type).toBe("TWIN_SETUP");
    expect(classifyTraceText("Twin beds, revert to double on departure")?.type).toBe("TWIN_REVERT");
    expect(classifyTraceText("Twin-Betten wieder zurück auf Doppelbett")?.type).toBe("TWIN_REVERT");
  });

  it("lässt normale Traces in Ruhe", () => {
    expect(classifyTraceText("Late check-out requested 2 PM")).toBeNull();
    expect(classifyTraceText("")).toBeNull();
  });
});
