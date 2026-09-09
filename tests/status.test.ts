import { describe, expect, it } from "vitest";
import { noteBadgeVariant } from "@/components/status";

describe("noteBadgeVariant — room card note badge", () => {
  it("shows nothing when a room has no notes at all", () => {
    expect(noteBadgeVariant(0, 0)).toBeNull();
  });

  it("is brass/open when at least one note is still open", () => {
    expect(noteBadgeVariant(1, 3)).toBe("open");
    expect(noteBadgeVariant(3, 3)).toBe("open");
  });

  it("is gray/done when the room has notes but none are open", () => {
    expect(noteBadgeVariant(0, 2)).toBe("done");
  });
});
