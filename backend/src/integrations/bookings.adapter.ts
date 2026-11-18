import { Inject, Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { CLOCK, Clock } from '../common/domain';
import { BookingFilters } from '../common/dto';
import { FlightBookingSummariesService } from '../flight-bookings/flight-booking-summaries.service';
import { HotelBookingsService } from '../hotel-bookings/hotel-bookings.service';
import {
  AdminBookingReaderPort,
  BookingAccessPort,
  BookingSummary,
  PaginatedBookingSummary,
} from './contracts';

const PAGE_SIZE = 10;
const none = { items: [] as BookingSummary[], total: 0 };

/** Newest start first; ties by type, then reference, so pages are stable. */
export function compareSummaries(a: BookingSummary, b: BookingSummary) {
  return (
    b.startDate.localeCompare(a.startDate) ||
    a.type.localeCompare(b.type) ||
    a.reference.localeCompare(b.reference)
  );
}

/**
 * BOOKING_ACCESS and BOOKING_READER for the whole platform: combines hotel reservations
 * (HotelBookingsService) and flight bookings (FlightBookingSummariesService).
 * See docs/TEAM_INTEGRATION.md.
 */
@Injectable()
export class BookingsCompositeAdapter implements BookingAccessPort, AdminBookingReaderPort {
  constructor(
    private readonly hotels: HotelBookingsService,
    private readonly flights: FlightBookingSummariesService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * ACC-12: true if either source has an upcoming CONFIRMED booking. Runs inside the caller's
   * transaction; queries run one after another because a transaction allows one operation at a time.
   */
  async hasUpcomingConfirmedBookings(userId: string, now: Date, transaction: ClientSession) {
    if (await this.hotels.hasUpcomingConfirmedBookings(userId, now, transaction)) return true;
    return this.flights.hasUpcomingConfirmedBookings(userId, now, transaction);
  }

  /**
   * ACC-17: one read-only list of flight and hotel bookings, 10 per page. Each source returns its
   * total and its first page*10 rows; the rows are merged and sorted BEFORE the page is cut, so a
   * page never mixes two separately paginated lists.
   */
  async findBookings(filters: BookingFilters): Promise<PaginatedBookingSummary> {
    const page = filters.page ?? 1;
    const limit = page * PAGE_SIZE;
    const [hotel, flight] = await Promise.all([
      !filters.type || filters.type === 'HOTEL'
        ? this.hotels.findBookingSummaries(filters, limit)
        : none,
      !filters.type || filters.type === 'FLIGHT'
        ? this.flights.findBookingSummaries(filters, limit, this.clock.now())
        : none,
    ]);
    const total = hotel.total + flight.total;
    return {
      items: [...hotel.items, ...flight.items]
        .sort(compareSummaries)
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total,
      page,
      pageCount: Math.ceil(total / PAGE_SIZE),
    };
  }
}
