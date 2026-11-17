/**
 * GEN-11 lifecycle for hotel reservations:
 * PENDING_PAYMENT -> CONFIRMED -> COMPLETED
 * PENDING_PAYMENT -> EXPIRED   (10-minute hold timed out, HTL-18)
 * CONFIRMED       -> CANCELLED (user cancellation, HTL-21)
 */
export enum HotelBookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum HotelBookingGroup {
  UPCOMING = 'UPCOMING',
  PAST = 'PAST',
  CANCELLED = 'CANCELLED',
}

/** HTL-18: all selected rooms are held together for exactly 10 minutes. */
export const HOLD_DURATION_MS = 10 * 60 * 1000;
/** Upper bounds that keep one reservation (and its room-night locks) reasonably sized. */
export const MAX_ROOMS_PER_BOOKING = 10;
export const MAX_NIGHTS_PER_BOOKING = 30;
/** GEN-05: page size 10. */
export const PAGE_SIZE = 10;
/** HTL-23: optional review text limit. */
export const REVIEW_MAX_LENGTH = 1000;
/** How often the lifecycle worker expires holds, completes stays and confirms paid holds. */
export const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;
