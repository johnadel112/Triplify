import { describe, expect, it } from "vitest";
import { accessDecision } from "./access";
import type { User } from "./types";
const user: User = {
  id: "1",
  name: "Test",
  email: "test@example.com",
  preferredCurrency: "USD",
  role: "USER",
  status: "ACTIVE",
  mustChangePassword: false,
  createdAt: "",
};
describe("route policy", () => {
  it("requires authentication", () =>
    expect(accessDecision(null, "/admin", ["ADMIN"])).toBe("login"));
  it("denies travelers admin access", () =>
    expect(accessDecision(user, "/admin", ["ADMIN"])).toBe("denied"));
  it("allows administrators", () =>
    expect(
      accessDecision({ ...user, role: "ADMIN" }, "/admin", ["ADMIN"]),
    ).toBe("allow"));
  it("blocks suspended and unexpected roles", () => {
    expect(accessDecision({ ...user, status: "SUSPENDED" }, "/account")).toBe(
      "denied",
    );
    expect(
      accessDecision({ ...user, role: "UNKNOWN" as User["role"] }, "/account"),
    ).toBe("denied");
  });
  it("confines forced change to security", () => {
    expect(
      accessDecision({ ...user, mustChangePassword: true }, "/admin"),
    ).toBe("password");
    expect(
      accessDecision(
        { ...user, mustChangePassword: true },
        "/account/security",
      ),
    ).toBe("allow");
  });
  it("separates moderator roles", () =>
    expect(
      accessDecision({ ...user, role: "HOTEL_MODERATOR" }, "/moderator", [
        "AIRLINE_MODERATOR",
      ]),
    ).toBe("denied"));
});
