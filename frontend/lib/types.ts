export type UserRole =
  "USER" | "ADMIN" | "HOTEL_MODERATOR" | "AIRLINE_MODERATOR";
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  preferredCurrency: string;
  role: UserRole;
  status: AccountStatus;
  providerId?: string;
  providerType?: "HOTEL" | "AIRLINE";
  mustChangePassword: boolean;
  createdAt: string;
}

export interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  fields?: Record<string, string> | { field: string; messages: string[] }[];
}
