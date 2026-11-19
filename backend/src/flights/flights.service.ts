import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, ClientSession } from 'mongoose';
import { Flight, AirlineProfile } from './flights.schema';
import { Airport } from '../reference-data/reference.schema';
import { NOTIFICATION_DELIVERY, NotificationDeliveryPort } from '../integrations/contracts';
import {
  AirlineProfileDto,
  CreateAirlineDto,
  CreateFlightDto,
  SearchFlightsQuery,
  UpdateFlightDto,
} from './flights.dto';

/** Optional DTO fields exist as undefined; drop them so updates never erase stored values. */
function definedOnly<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
import moment from 'moment-timezone';

@Injectable()
export class FlightsService {
  constructor(
    @InjectModel(Flight.name) private flightModel: Model<Flight>,
    @InjectModel(AirlineProfile.name) private airlineModel: Model<AirlineProfile>,
    @InjectModel(Airport.name) private airportModel: Model<Airport>,
    @Inject(NOTIFICATION_DELIVERY) private notificationDelivery: NotificationDeliveryPort,
  ) {}

  // FLT-01, GEN-06: Moderator-specific airline profile editing & notifications
  /** FLT-01: admin creates an airline; its moderator is then created with this id as providerId. */
  async createAirline(dto: CreateAirlineDto) {
    const airline = await this.airlineModel.create({
      name: dto.name,
      logoUrl: dto.logoUrl,
      contactEmail: dto.contactEmail,
    });
    return this.publicAirline(airline);
  }

  async getAirline(id: string) {
    const airline = await this.airlineModel.findOne({ _id: new Types.ObjectId(id), active: true });
    if (!airline) throw new NotFoundException('Airline not found');
    return this.publicAirline(airline);
  }

  private publicAirline(airline: AirlineProfile) {
    return {
      id: airline.id as string,
      name: airline.name,
      logoUrl: airline.logoUrl,
      contactEmail: airline.contactEmail,
      verified: airline.verified,
      active: airline.active,
    };
  }

  async updateAirlineProfile(
    userId: string,
    providerId: string,
    dto: AirlineProfileDto,
    session?: ClientSession,
  ) {
    const updateData = definedOnly(dto);
    const profile = await this.airlineModel
      .findOne({
        _id: new Types.ObjectId(providerId),
        // The moderator is assigned by the admin through providerId; the first edit links them.
        $or: [{ moderatorId: new Types.ObjectId(userId) }, { moderatorId: { $exists: false } }],
      })
      .session(session || null);
    if (!profile) throw new ForbiddenException('Assigned airline profile not found');
    Object.assign(profile, updateData);
    profile.moderatorId = new Types.ObjectId(userId);
    const saved = await profile.save({ session });

    await this.notificationDelivery.deliver({
      eventId: new Types.ObjectId().toString(),
      action: 'UPDATE_AIRLINE_PROFILE',
      targetId: saved._id.toString(),
      targetType: 'AirlineProfile',
      actorId: userId,
      occurredAt: new Date(),
    });

    return saved;
  }

  // FLT-03, FLT-04, FLT-05, FLT-06: Flight Creation & Inventory Validation
  async createFlight(airlineId: string, dto: CreateFlightDto) {
    const airline = await this.airlineModel.findOne({
      _id: airlineId,
      active: true,
      verified: true,
    });
    if (!airline) throw new ForbiddenException('Airline is not active and verified');
    const {
      flightNumber,
      departureAirportCode,
      arrivalAirportCode,
      departureTimeLocal,
      arrivalTimeLocal,
      cabins,
      extraBaggagePricePerKg,
      cancellationTiers,
    } = dto;

    const depAirport = await this.airportModel.findOne({ iataCode: departureAirportCode });
    const arrAirport = await this.airportModel.findOne({ iataCode: arrivalAirportCode });

    if (!depAirport || !arrAirport) {
      throw new BadRequestException('Invalid departure or arrival airport IATA code.');
    }

    const departureUtc = moment.tz(departureTimeLocal, depAirport.timeZone).utc().toDate();
    const arrivalUtc = moment.tz(arrivalTimeLocal, arrAirport.timeZone).utc().toDate();

    if (departureUtc < new Date()) {
      throw new BadRequestException('Departure time cannot be in the past.');
    }
    if (arrivalUtc <= departureUtc) {
      throw new BadRequestException('Arrival time must be after departure time in UTC.');
    }

    const departureDateOnly = moment(departureUtc).format('YYYY-MM-DD');

    const duplicate = await this.flightModel.findOne({
      airlineId,
      flightNumber,
      departureDate: departureDateOnly,
    });
    if (duplicate) {
      throw new BadRequestException(
        'An airline cannot have duplicate flight numbers on the same departure date.',
      );
    }

    for (const [cabinName, cabinData] of Object.entries(cabins) as [
      string,
      { seatCount: number },
    ][]) {
      if (!Number.isInteger(cabinData.seatCount) || cabinData.seatCount <= 0) {
        throw new BadRequestException(
          `Cabin seat counts must be positive whole numbers (${cabinName}).`,
        );
      }
    }

    const flight = new this.flightModel({
      flightNumber,
      airlineId: new Types.ObjectId(airlineId),
      departureAirport: depAirport.iataCode,
      arrivalAirport: arrAirport.iataCode,
      departureTimeUtc: departureUtc,
      arrivalTimeUtc: arrivalUtc,
      departureDate: departureDateOnly,
      cabins,
      extraBaggagePricePerKg,
      cancellationTiers,
      status: 'SCHEDULED',
    });

    return flight.save();
  }

  // FLT-09, FLT-11, FLT-12: Search, Filter, Sort (One-way & Round-trip)
  async searchFlights(queryDto: SearchFlightsQuery) {
    const {
      origin,
      destination,
      date,
      returnDate,
      cabinClass,
      passengers = 1,
      maxPrice,
      sortBy,
    } = queryDto;

    const now = new Date();
    const query: FilterQuery<Flight> = {
      departureAirport: origin,
      arrivalAirport: destination,
      [`cabins.${cabinClass}.seatCount`]: { $gte: Number(passengers) },
      // FLT-30: only Scheduled flights that have not departed are searchable.
      status: 'SCHEDULED',
      departureTimeUtc: { $gt: now },
    };
    const activeProfiles = await this.airlineModel
      .find({ active: true, verified: true })
      .select('_id moderatorId')
      .lean();
    const activeAirlines = activeProfiles.flatMap((profile) => [profile._id, profile.moderatorId]);
    query.airlineId = { $in: activeAirlines };

    if (date) query.departureDate = date;
    if (maxPrice) query[`cabins.${cabinClass}.price`] = { $lte: Number(maxPrice) };

    let dbQuery = this.flightModel.find(query);
    if (sortBy === 'price') dbQuery = dbQuery.sort({ [`cabins.${cabinClass}.price`]: 1 });
    if (sortBy === 'duration') dbQuery = dbQuery.sort({ departureTimeUtc: 1 });

    const outbound = await dbQuery.exec();

    let returnFlights: typeof outbound = [];
    if (returnDate) {
      const returnQuery = {
        departureAirport: destination,
        arrivalAirport: origin,
        departureDate: returnDate,
        [`cabins.${cabinClass}.seatCount`]: { $gte: Number(passengers) },
        status: 'SCHEDULED',
        departureTimeUtc: { $gt: now },
        airlineId: { $in: activeAirlines },
      };
      returnFlights = await this.flightModel.find(returnQuery).exec();
    }

    return { outbound, return: returnDate ? returnFlights : undefined };
  }

  // FLT-15, FLT-17: Flight Detail & Moderator Passenger Views
  async getFlightById(flightId: string) {
    const activeProfiles = await this.airlineModel
      .find({ active: true, verified: true })
      .select('_id moderatorId')
      .lean();
    const activeAirlines = activeProfiles.flatMap((profile) => [profile._id, profile.moderatorId]);
    const flight = await this.flightModel
      .findOne({ _id: flightId, airlineId: { $in: activeAirlines } })
      .populate('airlineId');
    if (!flight) throw new NotFoundException('Flight not found');
    return flight;
  }

  // FLT-29, FLT-30: Automatic status transitions & airport locking rules
  async updateFlight(
    flightId: string,
    airlineId: string,
    dto: UpdateFlightDto,
    legacyModeratorId?: string,
  ) {
    const updateDto = definedOnly(dto);
    const flight = await this.flightModel.findById(flightId);
    if (!flight) throw new NotFoundException('Flight not found');

    if (![airlineId, legacyModeratorId].includes(flight.airlineId?.toString())) {
      throw new ForbiddenException('You can only modify flights belonging to your airline.');
    }

    if (flight.status !== 'SCHEDULED') {
      throw new ConflictException('Only Scheduled flights can be edited.');
    }

    if ((updateDto.departureAirport || updateDto.arrivalAirport) && flight.hasConfirmedBookings) {
      throw new BadRequestException(
        'Airports cannot change after the flight has confirmed bookings.',
      );
    }

    Object.assign(flight, updateDto);
    return flight.save();
  }
}
