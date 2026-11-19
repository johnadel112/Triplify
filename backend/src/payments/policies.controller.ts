import { Body, Controller, Get, NotFoundException, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CurrentUser } from '../auth/guards';
import { Principal } from '../common/domain';
import { BookingType } from './payments.constants';
import { PolicyAcceptance } from './payments.schema';
import { AcceptPoliciesDto } from './payments.dto';
import { FlightBooking } from '../flight-bookings/flight-booking.schema';
import { HotelBooking } from '../hotel-bookings/hotel-booking.schema';
import { Flight } from '../flights/flights.schema';
import { ObjectIdPipe } from '../common/http';

@ApiTags('Policies')
@ApiCookieAuth()
@Controller('bookings')
export class PoliciesController {
  constructor(
    @InjectModel(PolicyAcceptance.name)
    private readonly policyAcceptanceModel: Model<PolicyAcceptance>,
    @InjectModel(FlightBooking.name) private readonly flightBookings: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private readonly hotelBookings: Model<HotelBooking>,
    @InjectModel(Flight.name) private readonly flights: Model<Flight>,
  ) {}

  private async policies(actor: Principal, type: BookingType, bookingId: string) {
    const owner = new Types.ObjectId(actor.id);
    const id = new Types.ObjectId(bookingId);
    if (type === BookingType.HOTEL) {
      const booking = await this.hotelBookings.findOne({ _id: id, userId: owner }).lean();
      if (!booking) throw new NotFoundException('Booking not found');
      return {
        checkInTime: booking.policy.checkInTime,
        checkOutTime: booking.policy.checkOutTime,
        cancellationPolicy: { tiers: booking.policy.cancellationTiers },
      };
    }
    const booking = await this.flightBookings.findOne({ _id: id, userId: owner }).lean();
    if (!booking) throw new NotFoundException('Booking not found');
    const flights = await this.flights.find({ _id: { $in: booking.legs.map((leg) => leg.flightId) } })
      .select('_id flightNumber extraBaggagePricePerKg').lean();
    const baggageByFlight = new Map(flights.map((flight) => [flight._id.toString(), flight]));
    return {
      cancellationPolicy: { tiers: booking.cancellationPolicy },
      // FLT-04/FLT-08 terms snapshotted at booking: free bags and weight per cabin, extra-bag price.
      baggagePolicy: {
        extraBagPrice: booking.baggagePolicy?.extraBagPrice ?? null,
        maxExtraBagsPerPassenger: booking.baggagePolicy?.maxExtraBagsPerPassenger ?? null,
        currency: booking.currency,
        legs: booking.legs.map((leg) => {
          const terms = booking.baggagePolicy?.legs.find((l) => l.flightId === leg.flightId.toString());
          return {
            flightId: leg.flightId.toString(),
            flightNumber: leg.flightNumber,
            cabinClass: leg.cabinClass,
            freeBags: terms?.freeBags ?? null,
            maxBagWeightKg: terms?.maxBagWeightKg ?? null,
            extraBaggagePricePerKg: baggageByFlight.get(leg.flightId.toString())?.extraBaggagePricePerKg ?? 0,
            currency: booking.currency,
          };
        }),
      },
    };
  }

  @Get(':type/:id/policies')
  @ApiOperation({
    summary:
      'Show provider policies before payment (airline: cancellation & baggage; hotel: cancellation & check-in/out)',
  })
  @ApiResponse({ status: 200, description: 'Provider policies returned' })
  async getPolicies(
    @CurrentUser() actor: Principal,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id', ObjectIdPipe) bookingId: string,
  ) {
    return { bookingId, bookingType: type, policies: await this.policies(actor, type, bookingId) };
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({
    summary:
      'Record explicit acceptance of provider policies with timestamp before payment (PAY-02)',
  })
  @ApiResponse({ status: 200, description: 'Policy acceptance recorded with timestamp' })
  async acceptPolicies(
    @CurrentUser() actor: Principal,
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id', ObjectIdPipe) bookingId: string,
    @Body() dto: AcceptPoliciesDto,
  ) {
    const acceptedAt = new Date();
    const snapshotPolicies = await this.policies(actor, type, bookingId);

    const record = await this.policyAcceptanceModel.findOneAndUpdate(
      {
        bookingId,
        userId: new Types.ObjectId(actor.id),
      },
      {
        bookingType: type,
        accepted: dto.accepted,
        acceptedAt,
        snapshotPolicies,
      },
      { upsert: true, new: true },
    );

    return {
      success: true,
      bookingId,
      bookingType: type,
      accepted: record.accepted,
      acceptedAt: record.acceptedAt,
    };
  }
}

