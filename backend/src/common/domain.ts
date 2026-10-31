export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  HOTEL_MODERATOR = 'HOTEL_MODERATOR',
  AIRLINE_MODERATOR = 'AIRLINE_MODERATOR',
}
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
}
export type ProviderType = 'HOTEL' | 'AIRLINE';
export interface Principal {
  id: string;
  name: string;
  role: UserRole;
  status: AccountStatus;
  providerId?: string;
  providerType?: ProviderType;
  mustChangePassword: boolean;
  authVersion: number;
  sessionId: string;
}
export const CLOCK = Symbol('CLOCK');
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
