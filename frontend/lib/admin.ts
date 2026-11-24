import { apiRequest, jsonBody } from "./api";
import type { User, UserRole, AccountStatus } from "./types";
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}
export type Account = Pick<
  User,
  "id" | "name" | "email" | "role" | "status" | "createdAt"
>;
export interface Booking {
  reference: string;
  type: string;
  user: { id: string; name: string };
  provider: { id: string; name: string };
  startDate: string;
  endDate?: string;
  amount: { value: string; currency: string };
  status: string;
}
export interface Report {
  id: string;
  reporter?: { name?: string; email?: string };
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  resolutionNotes?: string;
  createdAt: string;
}
export interface Audit {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  targetType: string;
  beforeStatus?: string;
  afterStatus?: string;
  outcome: string;
  occurredAt: string;
}
export function queryString(
  filters: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString();
}
export const adminApi = {
  accounts: (
    filters: {
      page: number;
      search?: string;
      role?: UserRole;
      status?: AccountStatus;
    },
    signal?: AbortSignal,
  ) =>
    apiRequest<Page<Account>>(`/admin/users?${queryString(filters)}`, {
      signal,
    }),
  accountStatus: (account: Account, active: boolean) =>
    apiRequest(
      `/admin/${account.role === "USER" ? "users" : "moderators"}/${account.id}/${active ? "reactivate" : "suspend"}`,
      { method: "PATCH" },
    ),
  reset: (id: string) =>
    apiRequest<{ temporaryPassword: string; mustChangePassword: boolean }>(
      `/admin/users/${id}/reset-password`,
      { method: "POST" },
    ),
  moderator: (input: {
    name: string;
    email: string;
    password: string;
    role: "HOTEL_MODERATOR" | "AIRLINE_MODERATOR";
    providerId: string;
  }) =>
    apiRequest<User>("/admin/moderators", {
      method: "POST",
      ...jsonBody(input),
    }),
  provider: (type: "hotels" | "airlines", id: string, active: boolean) =>
    apiRequest(
      `/admin/providers/${type}/${id}/${active ? "reactivate" : "deactivate"}`,
      { method: "PATCH" },
    ),
  resolve: (id: string, action: "DISMISS" | "HIDE" | "DELETE", notes: string) =>
    apiRequest(`/admin/reports/${id}`, {
      method: "PATCH",
      ...jsonBody({ action, notes }),
    }),
  deleteContent: (type: string, id: string) =>
    apiRequest(`/admin/content/${type}/${id}`, { method: "DELETE" }),
};
