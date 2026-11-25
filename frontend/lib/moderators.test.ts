import { describe, expect, it, vi, beforeEach } from "vitest";
import { airlineApi, hotelApi, referenceApi } from "./moderators";
import { accessDecision } from "./access";
import type { User } from "./types";

describe("Moderator access decisions", () => {
  const airlineMod: User = {
    id: "user-airline-1",
    name: "Airline Mod",
    email: "airline@triplify.test",
    preferredCurrency: "USD",
    role: "AIRLINE_MODERATOR",
    status: "ACTIVE",
    providerId: "64f1a2b3c4d5e6f7a8b9c0d1",
    providerType: "AIRLINE",
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const hotelMod: User = {
    id: "user-hotel-1",
    name: "Hotel Mod",
    email: "hotel@triplify.test",
    preferredCurrency: "USD",
    role: "HOTEL_MODERATOR",
    status: "ACTIVE",
    providerId: "64f1a2b3c4d5e6f7a8b9c0d2",
    providerType: "HOTEL",
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const regularUser: User = {
    id: "user-regular-1",
    name: "Regular User",
    email: "user@triplify.test",
    preferredCurrency: "USD",
    role: "USER",
    status: "ACTIVE",
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  it("permits airline moderator on airline routes and denies on hotel or admin", () => {
    expect(accessDecision(airlineMod, "/dashboard", ["AIRLINE_MODERATOR"])).toBe("allow");
    expect(accessDecision(airlineMod, "/dashboard/airline", ["AIRLINE_MODERATOR"])).toBe("allow");
    expect(accessDecision(airlineMod, "/dashboard/hotel", ["HOTEL_MODERATOR"])).toBe("denied");
    expect(accessDecision(airlineMod, "/admin", ["ADMIN"])).toBe("denied");
  });

  it("permits hotel moderator on hotel routes and denies on airline or admin", () => {
    expect(accessDecision(hotelMod, "/dashboard", ["HOTEL_MODERATOR"])).toBe("allow");
    expect(accessDecision(hotelMod, "/dashboard/hotel", ["HOTEL_MODERATOR"])).toBe("allow");
    expect(accessDecision(hotelMod, "/dashboard/airline", ["AIRLINE_MODERATOR"])).toBe("denied");
    expect(accessDecision(hotelMod, "/admin", ["ADMIN"])).toBe("denied");
  });

  it("denies regular user on moderator routes", () => {
    expect(accessDecision(regularUser, "/dashboard/airline", ["AIRLINE_MODERATOR"])).toBe("denied");
    expect(accessDecision(regularUser, "/dashboard/hotel", ["HOTEL_MODERATOR"])).toBe("denied");
  });
});

describe("Moderator API helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("formats export URL correctly for flights", () => {
    const url = airlineApi.getPassengerExportUrl("flight-123");
    expect(url).toContain("/flights/flight-123/passengers/export");
  });

  it("exposes expected API objects", () => {
    expect(typeof airlineApi.listFlights).toBe("function");
    expect(typeof hotelApi.listRooms).toBe("function");
    expect(typeof referenceApi.listAirports).toBe("function");
  });
});
