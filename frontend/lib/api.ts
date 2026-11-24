import type { ApiErrorBody } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);
const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string>,
    message = "Request failed",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response) {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Some proxy and infrastructure failures do not return JSON.
  }
  const message = Array.isArray(body.message)
    ? body.message.join(". ")
    : body.message;
  const fields = Array.isArray(body.fields)
    ? Object.fromEntries(
        body.fields.map((item) => [item.field, item.messages.join(". ")]),
      )
    : body.fields;
  return new ApiError(
    response.status,
    body.code,
    fields,
    response.status >= 500
      ? "The service is temporarily unavailable. Please try again."
      : message || response.statusText || "Request failed",
  );
}

async function rawRequest(path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (MUTATIONS.has(method)) headers.set("X-Triplify-CSRF", "1");
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    signal,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

async function performRefresh() {
  const refresh = await rawRequest("/auth/refresh", { method: "POST" });
  return refresh.ok;
}

async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request("triplify-auth-refresh", async () => {
        const recovered = await rawRequest("/auth/me");
        if (recovered.ok) return true;
        return performRefresh();
      });
    }
    return performRefresh();
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  let response = await rawRequest(path, init);
  const isAuthOperation =
    path === "/auth/login" ||
    path === "/auth/register" ||
    path === "/auth/refresh";

  if (
    response.status === 401 &&
    retry &&
    !isAuthOperation &&
    (await refreshSession())
  ) {
    response = await rawRequest(path, init);
  }
  if (!response.ok) {
    const error = await readError(response);
    if (typeof window !== "undefined" && !isAuthOperation) {
      if (response.status === 401)
        window.dispatchEvent(new Event("triplify:session-expired"));
      if (error.code === "PASSWORD_CHANGE_REQUIRED")
        window.dispatchEvent(new Event("triplify:password-required"));
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function jsonBody(value: unknown): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(value) };
}
