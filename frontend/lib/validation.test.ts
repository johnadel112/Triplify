import { expect, it } from "vitest";
import {
  registerSchema,
  passwordSchema,
  profileSchema,
  loginSchema,
} from "./validation";
it("requires explicit consent and valid registration fields", () => {
  const valid = {
    name: "Traveler",
    email: "guest@example.com",
    password: "Secure123",
    consent: true,
  };
  expect(registerSchema.safeParse(valid).success).toBe(true);
  for (const patch of [
    { consent: false },
    { password: "abcdefgh" },
    { password: "12345678" },
    { password: "Longé1234" },
    { name: " " },
    { email: "invalid" },
  ])
    expect(registerSchema.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
});
it("validates password confirmation", () =>
  expect(
    passwordSchema.safeParse({
      currentPassword: "Old12345",
      newPassword: "Secure123",
      confirmPassword: "different",
    }).success,
  ).toBe(false));
it("validates profile input and normalizes currencies", () => {
  expect(
    profileSchema.parse({
      name: " Traveler ",
      phoneNumber: "+20 12345",
      preferredCurrency: "usd",
    }).preferredCurrency,
  ).toBe("USD");
  expect(
    profileSchema.safeParse({
      name: "A",
      phoneNumber: "invalid",
      preferredCurrency: "USD",
    }).success,
  ).toBe(false);
});
it("requires login credentials", () =>
  expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(
    false,
  ));
