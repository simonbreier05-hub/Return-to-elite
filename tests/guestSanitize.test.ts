import { describe, expect, it } from "vitest";
import { sanitizeGuestText } from "@/lib/guestSanitize";

describe("sanitizeGuestText", () => {
  it("strips HTML-tag-shaped sequences", () => {
    expect(sanitizeGuestText("<script>alert(1)</script>Bathroom light is out")).toBe("alert(1)Bathroom light is out");
  });

  it("strips control characters", () => {
    expect(sanitizeGuestText("Towels\u0000 please\u001f")).toBe("Towels please");
  });

  it("collapses runs of spaces/tabs and trims", () => {
    expect(sanitizeGuestText("  too   much   \t whitespace  ")).toBe("too much whitespace");
  });

  it("leaves normal guest text untouched", () => {
    expect(sanitizeGuestText("Please clean at 3pm, thanks!")).toBe("Please clean at 3pm, thanks!");
  });
});
