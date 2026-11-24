import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "./api";
import { adminApi, type Account } from "./admin";
vi.mock("./api", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));
beforeEach(() => vi.mocked(apiRequest).mockClear());
it("uses distinct user and moderator transition endpoints", async () => {
  await adminApi.accountStatus({ id: "abc", role: "USER" } as Account, false);
  expect(apiRequest).toHaveBeenLastCalledWith("/admin/users/abc/suspend", {
    method: "PATCH",
  });
  await adminApi.accountStatus(
    { id: "xyz", role: "HOTEL_MODERATOR" } as Account,
    true,
  );
  expect(apiRequest).toHaveBeenLastCalledWith(
    "/admin/moderators/xyz/reactivate",
    { method: "PATCH" },
  );
});
it("uses exact provider paths", async () => {
  await adminApi.provider("hotels", "abc", false);
  expect(apiRequest).toHaveBeenLastCalledWith(
    "/admin/providers/hotels/abc/deactivate",
    { method: "PATCH" },
  );
  await adminApi.provider("airlines", "abc", true);
  expect(apiRequest).toHaveBeenLastCalledWith(
    "/admin/providers/airlines/abc/reactivate",
    { method: "PATCH" },
  );
});
it("sends supported moderation DTO and content type", async () => {
  await adminApi.resolve("abc", "HIDE", "Reviewed");
  expect(apiRequest).toHaveBeenLastCalledWith("/admin/reports/abc", {
    method: "PATCH",
    body: '{"action":"HIDE","notes":"Reviewed"}',
  });
  await adminApi.deleteContent("POST", "xyz");
  expect(apiRequest).toHaveBeenLastCalledWith("/admin/content/POST/xyz", {
    method: "DELETE",
  });
});
