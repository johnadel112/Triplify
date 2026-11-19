import type { ApiErrorBody } from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api').replace(/\/$/, '');
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string>,
    message = 'Request failed',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readError(response: Response) {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Some proxy and infrastructure failures do not return JSON.
  }
  const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
  return new ApiError(response.status, body.code, body.fields, message || response.statusText || 'Request failed');
}

async function rawRequest(path: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (MUTATIONS.has(method)) headers.set('X-Triplify-CSRF', '1');
  return fetch(`${API_BASE}${path}`, { ...init, method, headers, credentials: 'include' });
}

async function performRefresh() {
  const refresh = await rawRequest('/auth/refresh', { method: 'POST' });
  return refresh.ok;
}

async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('triplify-auth-refresh', async () => {
        const recovered = await rawRequest('/auth/me');
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

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let response = await rawRequest(path, init);
  const isAuthOperation = path === '/auth/login' || path === '/auth/register' || path === '/auth/refresh';

  if (response.status === 401 && retry && !isAuthOperation && (await refreshSession())) {
    response = await rawRequest(path, init);
  }
  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) };
}
