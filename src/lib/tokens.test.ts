import { describe, expect, it } from "vitest";
import { generateToken } from "./tokens";

describe("generateToken", () => {
  it("returns a 22-char url-safe string", () => {
    const t = generateToken();
    expect(t).toHaveLength(22);
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("returns distinct values", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
