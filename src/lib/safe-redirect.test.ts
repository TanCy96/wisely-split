import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("defaults to / for missing values", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("keeps a normal in-app path (with query)", () => {
    expect(safeNextPath("/update-password")).toBe("/update-password");
    expect(safeNextPath("/m/abc?x=1")).toBe("/m/abc?x=1");
  });

  it("rejects anything that is not a rooted path", () => {
    expect(safeNextPath("update-password")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
  });

  it("rejects protocol-relative and backslash tricks (open-redirect)", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
});
