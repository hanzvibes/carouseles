import { describe, expect, it } from "vitest";
import { safeExportName } from "./export";

describe("carousel export helpers", () => {
  it("creates filesystem-safe names", () => {
    expect(safeExportName("My New Carousel!")).toBe("my-new-carousel");
    expect(safeExportName("  ")).toBe("carousel");
    expect(safeExportName("R/WORKS — Ideas")).toBe("r-works-ideas");
  });
});
