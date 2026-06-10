import { describe, expect, it } from "vitest";
import { authErrorMessage, authErrorRedirectPath } from "./auth-errors";

describe("auth error messaging", () => {
  it("turns duplicate signup failures into a register page message", () => {
    const message = authErrorMessage({
      message: "User already registered",
    });

    expect(message).toBe("An account already exists for this email.");
    expect(authErrorRedirectPath("/register", message)).toBe(
      "/register?error=An%20account%20already%20exists%20for%20this%20email."
    );
  });
});
