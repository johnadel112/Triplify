import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest, jsonBody } from "./api";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {});
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
it("sends credentials and CSRF headers without caching private data", async () => {
  fetchMock.mockResolvedValue(response({ success: true }));
  await apiRequest("/users/me", {
    method: "PATCH",
    ...jsonBody({ name: "A" }),
  });
  const init = fetchMock.mock.calls[0][1];
  expect(init.credentials).toBe("include");
  expect(init.cache).toBe("no-store");
  expect(init.headers.get("X-Triplify-CSRF")).toBe("1");
  expect(init.body).toBe('{"name":"A"}');
});
it.each([
  ["ACCOUNT_LOCKED", 423],
  ["ACCOUNT_SUSPENDED", 403],
  ["INVALID_CREDENTIALS", 401],
])("preserves actionable login errors: %s", async (code, status) => {
  fetchMock.mockResolvedValue(
    response({ code, message: "Sign-in unavailable" }, status),
  );
  await expect(
    apiRequest("/auth/login", { method: "POST" }),
  ).rejects.toMatchObject({ code, status });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("retries once after supported refresh", async () => {
  fetchMock
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(response({ success: true }))
    .mockResolvedValueOnce(response({ id: "recovered" }));
  await expect(apiRequest("/users/me")).resolves.toEqual({ id: "recovered" });
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    "/api/users/me",
    "/api/auth/refresh",
    "/api/users/me",
  ]);
});
it("notifies consumers when a session has expired", async () => {
  const target = new EventTarget();
  const listener = vi.fn();
  target.addEventListener("triplify:session-expired", listener);
  vi.stubGlobal("window", target);
  fetchMock.mockResolvedValue(response({}, 401));
  await expect(apiRequest("/users/me")).rejects.toMatchObject({ status: 401 });
  expect(listener).toHaveBeenCalledTimes(1);
});
it("does not expose server internals", async () => {
  fetchMock.mockResolvedValue(
    response({ message: "Database password secret stack trace" }, 500),
  );
  await expect(apiRequest("/admin/users")).rejects.toThrow(
    "temporarily unavailable",
  );
});
it("does not report successful logout on failure", async () => {
  fetchMock.mockResolvedValue(response({}, 503));
  await expect(
    apiRequest("/auth/logout", { method: "POST" }),
  ).rejects.toMatchObject({ status: 503 });
});
it("preserves structured field errors", async () => {
  fetchMock.mockResolvedValue(
    response({ fields: { name: "Required" }, message: ["Invalid name"] }, 400),
  );
  await expect(apiRequest("/users/me")).rejects.toMatchObject({
    fields: { name: "Required" },
    message: "Invalid name",
  });
});
it("forwards cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  fetchMock.mockImplementation((_url, init) => {
    if (init.signal.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));
  });
  await expect(
    apiRequest("/admin/users", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
it("normalizes the real Nest validation field array", async () => {
  fetchMock.mockResolvedValue(
    response(
      {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        fields: [{ field: "name", messages: ["Name is required"] }],
      },
      400,
    ),
  );
  await expect(apiRequest("/users/me")).rejects.toMatchObject({
    fields: { name: "Name is required" },
  });
});
