import { ClientSession } from 'mongoose';
import { BookingFilters } from '../common/dto';
import { ProviderType } from '../common/domain';
export const BOOKING_ACCESS = Symbol('BOOKING_ACCESS');
export const BOOKING_READER = Symbol('BOOKING_READER');
export const PROVIDER_MANAGEMENT = Symbol('PROVIDER_MANAGEMENT');
export interface BookingAccessPort {
  // Must serialize against new confirmed bookings for this user in the same transaction.
  hasUpcomingConfirmedBookings(
    userId: string,
    now: Date,
    transaction: ClientSession,
  ): Promise<boolean>;
}
export interface BookingSummary {
  reference: string;
  type: 'FLIGHT' | 'HOTEL';
  user: { id: string; name: string };
  provider: { id: string; name: string };
  startDate: string;
  endDate?: string;
  amount: { value: string; currency: string };
  status: string;
}
export interface PaginatedBookingSummary {
  items: BookingSummary[];
  total: number;
  page: number;
  pageCount: number;
}
export interface AdminBookingReaderPort {
  findBookings(filters: BookingFilters): Promise<PaginatedBookingSummary>;
}
export interface ProviderManagementPort {
  verifyProvider(type: ProviderType, id: string, transaction: ClientSession): Promise<boolean>;
  // Update actual provider data in this transaction. Reject invalid transitions.
  setProviderActive(
    type: ProviderType,
    id: string,
    active: boolean,
    transaction: ClientSession,
  ): Promise<void>;
}
export interface AdminNotificationEvent {
  eventId: string;
  action: string;
  targetId: string;
  targetType: string;
  actorId: string;
  occurredAt: Date;
  status?: string;
}
export const NOTIFICATION_DELIVERY = Symbol('NOTIFICATION_DELIVERY');
export interface NotificationDeliveryPort {
  deliver(event: AdminNotificationEvent): Promise<void>;
}
