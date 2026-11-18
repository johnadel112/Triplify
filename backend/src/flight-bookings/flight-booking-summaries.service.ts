import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import { BookingFilters } from '../common/dto';
import { AirlineProfile, Flight } from '../flights/flights.schema';
import { BookingSummary } from '../integrations/contracts';
import { User } from '../users/user.schema';
import { FlightBooking } from './flight-booking.schema';

/**
 * Flight half of the shared booking contracts (ACC-12, ACC-17). Read-only: it never changes
 * flight bookings, seats or payments.
 *
 * Flight bookings have no COMPLETED status; like the user's "Past" tab, a CONFIRMED booking whose
 * last departure has passed is reported as COMPLETED. DRAFT bookings (never held) are not shown.
 */
@Injectable()
export class FlightBookingSummariesService {
  constructor(
    @InjectModel(FlightBooking.name) private readonly bookings: Model<FlightBooking>,
    @InjectModel(Flight.name) private readonly flights: Model<Flight>,
    @InjectModel(AirlineProfile.name) private readonly airlines: Model<AirlineProfile>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  /** BOOKING_ACCESS flight half: a CONFIRMED booking with a departure still ahead. */
  async hasUpcomingConfirmedBookings(userId: string, now: Date, session: ClientSession) {
    const found = await this.bookings
      .exists({
        userId: new Types.ObjectId(userId),
        status: 'CONFIRMED',
        lastDeparture: { $gt: now },
      })
      .session(session);
    return !!found;
  }

  /**
   * BOOKING_READER flight half: total matching bookings and the first `limit` rows sorted by start
   * date descending, so the composite adapter can merge flights and hotels before paginating.
   */
  async findBookingSummaries(
    filters: BookingFilters,
    limit: number,
    now: Date,
  ): Promise<{ items: BookingSummary[]; total: number }> {
    const query: FilterQuery<FlightBooking> = this.statusQuery(filters.status, now);
    const range: Record<string, Date> = {};
    if (filters.startDate) range.$gte = new Date(filters.startDate);
    if (filters.endDate) range.$lte = new Date(filters.endDate);
    if (Object.keys(range).length) query.firstDeparture = range;

    const [rows, total] = await Promise.all([
      this.bookings.find(query).sort({ firstDeparture: -1, reference: 1 }).limit(limit).lean(),
      this.bookings.countDocuments(query),
    ]);
    const [names, airlines] = await Promise.all([
      this.userNames(rows.map((r) => r.userId)),
      this.airlinesFor(rows.flatMap((r) => r.legs.map((l) => l.flightId))),
    ]);

    return {
      total,
      items: rows.map((b) => {
        const first = b.legs[0];
        const last = b.legs[b.legs.length - 1];
        const airline = first ? airlines.get(first.flightId.toString()) : undefined;
        return {
          reference: b.reference,
          type: 'FLIGHT' as const,
          user: { id: b.userId.toString(), name: names.get(b.userId.toString()) ?? 'Unknown user' },
          provider: airline ?? {
            id: first ? first.flightId.toString() : '',
            name: first ? `Flight ${first.flightNumber}` : 'Unknown airline',
          },
          startDate: b.firstDeparture.toISOString(),
          endDate: (last?.arrivalTime ?? b.lastDeparture).toISOString(),
          amount: { value: b.totalPrice.toFixed(2), currency: b.currency },
          status: this.summaryStatus(b.status, b.lastDeparture, now),
        };
      }),
    };
  }

  private statusQuery(status: string | undefined, now: Date): FilterQuery<FlightBooking> {
    switch (status) {
      case 'PENDING':
        return { status: 'PENDING' };
      case 'CONFIRMED':
        return { status: 'CONFIRMED', lastDeparture: { $gte: now } };
      case 'COMPLETED':
        return { status: 'CONFIRMED', lastDeparture: { $lt: now } };
      case 'CANCELLED':
        return { status: { $in: ['CANCELLED', 'EXPIRED'] } };
      default:
        return { status: { $ne: 'DRAFT' } };
    }
  }

  private summaryStatus(status: string, lastDeparture: Date, now: Date) {
    if (status === 'CONFIRMED') return lastDeparture < now ? 'COMPLETED' : 'CONFIRMED';
    if (status === 'CANCELLED' || status === 'EXPIRED') return 'CANCELLED';
    return 'PENDING';
  }

  private async userNames(ids: Types.ObjectId[]) {
    if (!ids.length) return new Map<string, string>();
    const users = await this.users.find({ _id: { $in: ids } }, { name: 1 }).lean();
    return new Map(users.map((u) => [u._id.toString(), u.name]));
  }

  /**
   * Airline per flight. Flight.airlineId may hold the airline profile id or the moderator's user id
   * (flights currently store the moderator id), so both are matched.
   */
  private async airlinesFor(flightIds: Types.ObjectId[]) {
    const result = new Map<string, { id: string; name: string }>();
    if (!flightIds.length) return result;
    const flights = await this.flights
      .find({ _id: { $in: flightIds } }, { airlineId: 1 })
      .lean<{ _id: Types.ObjectId; airlineId?: Types.ObjectId }[]>();
    const airlineIds = flights.flatMap((f) => (f.airlineId ? [f.airlineId] : []));
    const profiles = airlineIds.length
      ? await this.airlines
          .find(
            { $or: [{ _id: { $in: airlineIds } }, { moderatorId: { $in: airlineIds } }] },
            { name: 1, moderatorId: 1 },
          )
          .lean<{ _id: Types.ObjectId; name?: string; moderatorId?: Types.ObjectId }[]>()
      : [];
    for (const flight of flights) {
      if (!flight.airlineId) continue;
      const key = flight.airlineId.toString();
      const profile = profiles.find(
        (p) => p._id.toString() === key || p.moderatorId?.toString() === key,
      );
      result.set(flight._id.toString(), {
        id: profile ? profile._id.toString() : key,
        name: profile?.name ?? 'Unknown airline',
      });
    }
    return result;
  }
}
