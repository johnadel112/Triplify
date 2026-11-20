import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AccountStatus, Principal } from '../common/domain';
import { AirlineProfile, Flight } from '../flights/flights.schema';
import { BookingLeg, FlightBooking } from '../flight-bookings/flight-booking.schema';
import { User } from '../users/user.schema';
import { Notification, NotificationType } from '../notifications/notifications.schema';
import { ChangeFlightDto, SeatChoiceDto, SeatMapDto } from './bonus.dto';

@Injectable()
export class FlightExtrasService {
  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(Flight.name) private flights: Model<Flight>,
    @InjectModel(FlightBooking.name) private bookings: Model<FlightBooking>,
    @InjectModel(AirlineProfile.name) private airlines: Model<AirlineProfile>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Notification.name) private notifications: Model<Notification>,
  ) {}
  async configureSeats(actor: Principal, id: string, dto: SeatMapDto) {
    return this.connection.transaction(async (session) => {
      const airline = await this.airlines
        .findOne({ _id: actor.providerId, active: true, verified: true })
        .session(session);
      const flight =
        airline &&
        (await this.flights
          .findOne({
            _id: id,
            airlineId: { $in: [airline._id, airline.moderatorId] },
            status: 'SCHEDULED',
            departureTimeUtc: { $gt: new Date() },
          })
          .session(session));
      if (!flight) throw new NotFoundException('Flight not found');
      const occupied = await this.bookings
        .exists({ 'legs.flightId': flight._id, status: { $in: ['PENDING', 'CONFIRMED'] } })
        .session(session);
      if (occupied)
        throw new ConflictException('Seat maps cannot change after seats have been held or booked');
      if (dto.seats.length !== flight.cabins[dto.cabinClass]?.seatCount)
        throw new BadRequestException('Seat map must match cabin capacity');
      if (
        Object.entries(flight.seatMaps ?? {}).some(
          ([cabin, seats]) =>
            cabin !== dto.cabinClass && seats.some((seat) => dto.seats.includes(seat)),
        )
      ) {
        throw new BadRequestException('Seat labels must be unique across cabins');
      }
      flight.seatMaps = { ...flight.seatMaps, [dto.cabinClass]: dto.seats };
      flight.markModified('seatMaps');
      await flight.save({ session });
      return { cabinClass: dto.cabinClass, seats: dto.seats };
    });
  }
  async seatMap(actor: Principal, bookingId: string, legIndex: number) {
    const booking = await this.bookings.findOne({ _id: bookingId, userId: actor.id });
    if (!booking) throw new NotFoundException('Booking not found');
    const leg = booking.legs[legIndex];
    if (!leg) throw new NotFoundException('Leg not found');
    const flight = await this.flights.findById(leg.flightId).select('+seatAssignments');
    if (!flight) throw new NotFoundException('Flight not found');
    return {
      legIndex,
      cabinClass: leg.cabinClass,
      seats: (flight.seatMaps?.[leg.cabinClass] ?? []).map((seat) => ({
        seat,
        available: !(flight.seatAssignments ?? []).some(
          (a) =>
            a.cabinClass === leg.cabinClass && a.seat === seat && String(a.bookingId) !== bookingId,
        ),
        selected: (leg.selectedSeats ?? []).includes(seat),
      })),
    };
  }
  async selectSeats(actor: Principal, id: string, dto: SeatChoiceDto) {
    return this.connection.transaction(async (session) => {
      const now = new Date();
      const booking = await this.bookings
        .findOne({
          _id: id,
          userId: actor.id,
          firstDeparture: { $gt: now },
          $or: [{ status: 'CONFIRMED' }, { status: 'PENDING', holdExpiresAt: { $gt: now } }],
        })
        .session(session);
      if (!booking)
        throw new ConflictException('An upcoming confirmed booking or active hold is required');
      const leg = booking.legs[dto.legIndex];
      if (!leg || dto.seats.length !== booking.seatCount)
        throw new BadRequestException('Choose one seat for each non-infant passenger on this leg');
      const flight = await this.flights
        .findOne({ _id: leg.flightId, status: 'SCHEDULED', departureTimeUtc: { $gt: now } })
        .select('+seatAssignments')
        .session(session);
      if (!flight) throw new ConflictException('Flight is not available');
      if (dto.seats.some((s) => !flight.seatMaps?.[leg.cabinClass]?.includes(s)))
        throw new BadRequestException('Seat is not in this cabin');
      if (
        (flight.seatAssignments ?? []).some(
          (a) =>
            a.cabinClass === leg.cabinClass &&
            dto.seats.includes(a.seat) &&
            String(a.bookingId) !== id,
        )
      )
        throw new ConflictException('Seat already selected');
      flight.seatAssignments = (flight.seatAssignments ?? []).filter(
        (a) => !(String(a.bookingId) === id && a.cabinClass === leg.cabinClass),
      );
      flight.seatAssignments.push(
        ...dto.seats.map((seat) => ({ seat, cabinClass: leg.cabinClass, bookingId: booking._id })),
      );
      leg.selectedSeats = dto.seats;
      booking.markModified('legs');
      await flight.save({ session });
      await booking.save({ session });
      return { legIndex: dto.legIndex, seats: dto.seats };
    });
  }
  async change(actor: Principal, id: string, dto: ChangeFlightDto) {
    return this.connection.transaction(async (session) => {
      const now = new Date();
      const booking = await this.bookings
        .findOne({ _id: id, userId: actor.id, status: 'CONFIRMED', firstDeparture: { $gt: now } })
        .session(session);
      if (!booking) throw new ConflictException('Only upcoming confirmed bookings can be changed');
      if (
        dto.legs.length !== booking.legs.length ||
        new Set(dto.legs.map((l) => l.flightId)).size !== dto.legs.length
      )
        throw new BadRequestException('Keep the same number of distinct flight legs');
      if (
        dto.legs.every(
          (l, i) =>
            l.flightId === String(booking.legs[i].flightId) &&
            l.cabinClass === booking.legs[i].cabinClass,
        )
      )
        throw new BadRequestException('No flight change requested');
      const active = await this.users.updateOne(
        { _id: actor.id, status: AccountStatus.ACTIVE },
        { $inc: { bookingRevision: 1 } },
        { session },
      );
      if (!active.modifiedCount) throw new ConflictException('Account is not active');
      const newLegs: BookingLeg[] = [];
      const bagKg = booking.passengers.reduce((sum, p) => sum + p.extraBaggageKg, 0);
      const extraBags = booking.passengers.reduce((sum, p) => sum + (p.extraBags ?? 0), 0);
      // Return old inventory within the same transaction; every failure rolls this back.
      for (const leg of booking.legs) {
        await this.flights.updateOne(
          { _id: leg.flightId },
          {
            $inc: { [`cabins.${leg.cabinClass}.seatCount`]: booking.seatCount },
            $pull: { seatAssignments: { bookingId: booking._id } },
          },
          { session },
        );
      }
      for (const [index, choice] of dto.legs.entries()) {
        const old = booking.legs[index];
        const source = await this.flights.findById(old.flightId).session(session);
        const next = await this.flights
          .findOne({ _id: choice.flightId, status: 'SCHEDULED', departureTimeUtc: { $gt: now } })
          .session(session);
        const cabin = next?.cabins[choice.cabinClass];
        if (!source || !next || !cabin)
          throw new NotFoundException('Replacement flight unavailable');
        const provider = await this.airlines
          .findOne({
            $or: [{ _id: source.airlineId }, { moderatorId: source.airlineId }],
            active: true,
            verified: true,
          })
          .session(session);
        if (
          !provider ||
          ![String(provider._id), String(provider.moderatorId)].includes(String(next.airlineId)) ||
          next.departureAirport !== old.departureAirport ||
          next.arrivalAirport !== old.arrivalAirport ||
          choice.cabinClass !== old.cabinClass
        )
          throw new BadRequestException('Changes must keep airline, route and cabin');
        const bagRule = provider.baggagePolicy;
        if (
          extraBags &&
          (!bagRule ||
            booking.passengers.some((p) => (p.extraBags ?? 0) > bagRule.maxExtraBagsPerPassenger) ||
            bagRule.extraBagPrice !== booking.baggagePolicy?.extraBagPrice)
        ) {
          throw new ConflictException('Replacement must preserve the purchased extra-bag terms');
        }
        const purchasedAllowance = booking.baggagePolicy?.legs[index];
        if (
          purchasedAllowance &&
          (purchasedAllowance.freeBags !== cabin.freeBags ||
            purchasedAllowance.maxBagWeightKg !== cabin.maxBagWeightKg)
        ) {
          throw new ConflictException(
            'Replacement must preserve the purchased cabin baggage allowance',
          );
        }
        const baggageCost =
          Math.round(
            (bagKg * next.extraBaggagePricePerKg + extraBags * (bagRule?.extraBagPrice ?? 0)) * 100,
          ) / 100;
        const total = Math.round((cabin.price * booking.seatCount + baggageCost) * 100) / 100;
        if (Math.round(total * 100) !== Math.round(old.legTotal * 100))
          throw new ConflictException(
            'Replacement must have the same fare; different fares require a new booking',
          );
        if (index && next.departureTimeUtc <= newLegs[index - 1].arrivalTime)
          throw new BadRequestException('Return must depart after outbound arrival');
        const eligible = await this.airlines.updateOne(
          { _id: provider._id, active: true, verified: true },
          { $inc: { bookingRevision: 1 } },
          { session },
        );
        if (!eligible.modifiedCount) throw new ConflictException('Airline unavailable');
        const taken = await this.flights.updateOne(
          { _id: next._id, [`cabins.${choice.cabinClass}.seatCount`]: { $gte: booking.seatCount } },
          {
            $inc: { [`cabins.${choice.cabinClass}.seatCount`]: -booking.seatCount },
            $set: { hasConfirmedBookings: true },
          },
          { session },
        );
        if (!taken.modifiedCount) throw new ConflictException('Not enough seats');
        newLegs.push({
          flightId: next._id as Types.ObjectId,
          flightNumber: next.flightNumber,
          cabinClass: choice.cabinClass,
          departureAirport: next.departureAirport,
          arrivalAirport: next.arrivalAirport,
          departureTime: next.departureTimeUtc,
          arrivalTime: next.arrivalTimeUtc,
          farePerSeat: cabin.price,
          baggageCost,
          legTotal: total,
          selectedSeats: [],
        });
      }
      booking.legs = newLegs;
      booking.firstDeparture = newLegs[0].departureTime;
      booking.lastDeparture = newLegs[newLegs.length - 1].departureTime;
      if (booking.baggagePolicy) {
        booking.baggagePolicy.legs = booking.baggagePolicy.legs.map((leg, index) => ({
          ...leg,
          flightId: String(newLegs[index].flightId),
        }));
        booking.markModified('baggagePolicy');
      }
      // Preserve the purchased cancellation policy and amount; no additional payment is collected.
      await booking.save({ session });
      await this.notifications.create(
        [
          {
            userId: booking.userId,
            title: 'Flight booking changed',
            message: `Your booking ${booking.reference} has been changed. Select seats for your new flights.`,
            type: NotificationType.FLIGHT_SCHEDULE_CHANGED,
          },
        ],
        { session },
      );
      return booking.toObject();
    });
  }
}
