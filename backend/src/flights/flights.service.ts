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
import { Cron, CronExpression } from '@nestjs/schedule';
import { Flight, AirlineProfile } from './flights.schema';
import { Airport } from '../reference-data/reference.schema';
import { NOTIFICATION_DELIVERY, NotificationDeliveryPort } from '../integrations/contracts';
import {
  AirlineCancellationPolicyDto,
  AirlineProfileDto,
  BaggagePolicyDto,
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
import { join } from 'path';
import {
  MEDIA_FILE_NAME,
  mediaDir,
  mediaFileName,
  prepareImages,
  removeImage,
  storeImages,
} from '../common/media';

const AIRLINE_MEDIA_FOLDER = 'airlines';
const FLIGHT_PAGE_SIZE = 10;
const AIRLINE_MEDIA_PREFIX = '/api/airlines/media/';

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
      code: dto.code,
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

  /** FLT-08: the assigned moderator sets the airline's extra baggage policy. */
  async setBaggagePolicy(airlineId: string, actorProviderId: string | undefined, dto: BaggagePolicyDto) {
    const airline = await this.ownAirline(airlineId, actorProviderId);
    airline.baggagePolicy = {
      extraBagPrice: dto.extraBagPrice,
      maxExtraBagsPerPassenger: dto.maxExtraBagsPerPassenger,
    };
    await airline.save();
    return this.publicAirline(airline);
  }

  /** FLT-09: the assigned moderator sets cancellation tiers; thresholds must be unique. */
  async setCancellationPolicy(
    airlineId: string,
    actorProviderId: string | undefined,
    dto: AirlineCancellationPolicyDto,
  ) {
    const days = dto.tiers.map((tier) => tier.daysBefore);
    if (new Set(days).size !== days.length) {
      throw new BadRequestException('Each cancellation tier needs a unique daysBefore threshold');
    }
    const airline = await this.ownAirline(airlineId, actorProviderId);
    airline.cancellationTiers = [...dto.tiers]
      .sort((a, b) => b.daysBefore - a.daysBefore)
      .map((tier) => ({ daysBefore: tier.daysBefore, refundPercentage: tier.refundPercentage }));
    await airline.save();
    return this.publicAirline(airline);
  }

  /** FLT-01, GEN-08: one uploaded JPG/PNG logo (<= 5 MB) per airline; replaces the previous one. */
  async setLogo(airlineId: string, actorProviderId: string | undefined, file: Express.Multer.File | undefined) {
    const airline = await this.ownAirline(airlineId, actorProviderId);
    const [prepared] = prepareImages(file ? [file] : []);
    const rollback = await storeImages(AIRLINE_MEDIA_FOLDER, [prepared]);
    const previous = airline.logoUrl ? mediaFileName(airline.logoUrl, AIRLINE_MEDIA_PREFIX) : undefined;
    try {
      airline.logoUrl = `${AIRLINE_MEDIA_PREFIX}${prepared.filename}`;
      await airline.save();
    } catch (error) {
      await rollback();
      throw error;
    }
    if (previous) await removeImage(AIRLINE_MEDIA_FOLDER, previous);
    return this.publicAirline(airline);
  }

  /** Public: a logo is served only while it is the current logo of an active airline. */
  async logoPath(filename: string) {
    if (!MEDIA_FILE_NAME.test(filename) ||
      !(await this.airlineModel.exists({ logoUrl: `${AIRLINE_MEDIA_PREFIX}${filename}`, active: true }))) {
      throw new NotFoundException('Logo not found');
    }
    return join(mediaDir(AIRLINE_MEDIA_FOLDER), filename);
  }

  private async ownAirline(airlineId: string, actorProviderId: string | undefined) {
    if (!actorProviderId || actorProviderId !== airlineId) {
      throw new ForbiddenException('You can only manage your own airline');
    }
    const airline = await this.airlineModel.findById(airlineId);
    if (!airline) throw new NotFoundException('Airline not found');
    return airline;
  }

  private publicAirline(airline: AirlineProfile) {
    return {
      id: airline.id as string,
      name: airline.name,
      code: airline.code,
      logoUrl: airline.logoUrl,
      contactEmail: airline.contactEmail,
      baggagePolicy: airline.baggagePolicy,
      cancellationTiers: airline.cancellationTiers,
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

    // FLT-11: the searchable date is the local date at the departure airport.
    const departureDateOnly = moment.tz(departureUtc, depAirport.timeZone).format('YYYY-MM-DD');

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
      minPrice,
      maxPrice,
      sortBy,
      adults,
      children = 0,
      infants = 0,
      page = 1,
    } = queryDto;
    // FLT-11: with passenger types, seats are needed for adults and children; infants travel on a lap.
    if ((children || infants) && adults === undefined) {
      throw new BadRequestException('Give the number of adults when searching with children or infants');
    }
    if (adults !== undefined && infants > adults) {
      throw new BadRequestException('Each infant must travel with an adult');
    }
    const seatsNeeded = adults !== undefined ? adults + children : Number(passengers);
    if (seatsNeeded > 9) throw new BadRequestException('At most 9 seated passengers per search');
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }
    // FLT-15: inclusive price range on the selected cabin, applied to outbound and return legs.
    const priceRange: Record<string, number> = {};
    if (minPrice !== undefined) priceRange.$gte = Number(minPrice);
    if (maxPrice !== undefined) priceRange.$lte = Number(maxPrice);

    const now = new Date();
    const query: FilterQuery<Flight> = {
      departureAirport: origin,
      arrivalAirport: destination,
      [`cabins.${cabinClass}.seatCount`]: { $gte: seatsNeeded },
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
    if (Object.keys(priceRange).length) query[`cabins.${cabinClass}.price`] = priceRange;

    const outbound = this.sortFlights(await this.flightModel.find(query).exec(), cabinClass, sortBy);

    let returnFlights: typeof outbound = [];
    if (returnDate) {
      const returnQuery = {
        departureAirport: destination,
        arrivalAirport: origin,
        departureDate: returnDate,
        [`cabins.${cabinClass}.seatCount`]: { $gte: seatsNeeded },
        status: 'SCHEDULED',
        departureTimeUtc: { $gt: now },
        airlineId: { $in: activeAirlines },
        ...(Object.keys(priceRange).length ? { [`cabins.${cabinClass}.price`]: priceRange } : {}),
      };
      returnFlights = this.sortFlights(await this.flightModel.find(returnQuery).exec(), cabinClass, sortBy);
    }

    // GEN-05: 10 results per page in each direction; totals let clients page through the rest.
    const start = (page - 1) * FLIGHT_PAGE_SIZE;
    return {
      outbound: outbound.slice(start, start + FLIGHT_PAGE_SIZE),
      return: returnDate ? returnFlights.slice(start, start + FLIGHT_PAGE_SIZE) : undefined,
      page,
      pageSize: FLIGHT_PAGE_SIZE,
      outboundTotal: outbound.length,
      returnTotal: returnDate ? returnFlights.length : undefined,
      seatsNeeded,
    };
  }

  /** ITN-26: IATA codes of the reference airports serving a city. */
  async airportCodesInCity(cityCode: string) {
    const airports = await this.airportModel.find({ city: cityCode }).select('iataCode').lean();
    return airports.map((a) => a.iataCode);
  }

  /** FLT-15: sort by cabin price, by duration (arrival - departure) or by departure time. */
  private sortFlights<T extends Flight>(rows: T[], cabinClass: string, sortBy?: string): T[] {
    const price = (f: T) => f.cabins?.[cabinClass]?.price ?? Number.POSITIVE_INFINITY;
    const duration = (f: T) => f.arrivalTimeUtc.getTime() - f.departureTimeUtc.getTime();
    const departure = (f: T) => f.departureTimeUtc.getTime();
    const key = sortBy === 'price' ? price : sortBy === 'duration' ? duration : departure;
    return [...rows].sort((a, b) => key(a) - key(b) || departure(a) - departure(b));
  }

  /** FLT-30: a Scheduled flight becomes Departed once its departure time has passed. */
  @Cron(CronExpression.EVERY_MINUTE)
  async markDepartedFlights(now = new Date()) {
    const result = await this.flightModel.updateMany(
      { status: 'SCHEDULED', departureTimeUtc: { $lte: now } },
      { $set: { status: 'DEPARTED' } },
    );
    return result.modifiedCount;
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
      .lean();
    if (!flight) throw new NotFoundException('Flight not found');
    // FLT-17: airline, airports, local times, duration and each cabin with price, seats and baggage.
    const [airline, airports] = await Promise.all([
      this.airlineModel
        .findOne({ $or: [{ _id: flight.airlineId }, { moderatorId: flight.airlineId }] })
        .select('name code logoUrl baggagePolicy cancellationTiers')
        .lean(),
      this.airportModel
        .find({ iataCode: { $in: [flight.departureAirport, flight.arrivalAirport] } })
        .lean(),
    ]);
    const airport = (code: string) => airports.find((a) => a.iataCode === code);
    const dep = airport(flight.departureAirport);
    const arr = airport(flight.arrivalAirport);
    const local = (at: Date, zone?: string) =>
      zone ? moment.tz(at, zone).format('YYYY-MM-DDTHH:mm') : undefined;
    return {
      ...flight,
      airlineId: undefined,
      airline: airline
        ? {
            id: String(airline._id),
            name: airline.name,
            code: airline.code,
            logoUrl: airline.logoUrl,
            baggagePolicy: airline.baggagePolicy,
            cancellationTiers: airline.cancellationTiers,
          }
        : undefined,
      departure: {
        airport: flight.departureAirport,
        name: dep?.name,
        city: dep?.city,
        timeZone: dep?.timeZone,
        localTime: local(flight.departureTimeUtc, dep?.timeZone),
      },
      arrival: {
        airport: flight.arrivalAirport,
        name: arr?.name,
        city: arr?.city,
        timeZone: arr?.timeZone,
        localTime: local(flight.arrivalTimeUtc, arr?.timeZone),
      },
      durationMinutes: Math.round(
        (flight.arrivalTimeUtc.getTime() - flight.departureTimeUtc.getTime()) / 60000,
      ),
      cabinDetails: Object.entries(flight.cabins ?? {}).map(([cabinClass, cabin]) => ({
        cabinClass,
        price: cabin.price,
        seatsRemaining: cabin.seatCount,
        freeBags: cabin.freeBags ?? null,
        maxBagWeightKg: cabin.maxBagWeightKg ?? null,
      })),
    };
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

    const now = new Date();
    if (flight.status === 'SCHEDULED' && flight.departureTimeUtc <= now) {
      flight.status = 'DEPARTED';
      await flight.save();
    }
    if (flight.status !== 'SCHEDULED') {
      throw new ConflictException('Only Scheduled flights can be edited.');
    }

    const {
      cabins,
      departureTimeLocal,
      arrivalTimeLocal,
      departureTimeUtc,
      arrivalTimeUtc,
      departureAirport,
      arrivalAirport,
      ...rest
    } = updateDto;

    const airportsChanged =
      (departureAirport !== undefined && departureAirport !== flight.departureAirport) ||
      (arrivalAirport !== undefined && arrivalAirport !== flight.arrivalAirport);
    if (airportsChanged && flight.hasConfirmedBookings) {
      throw new BadRequestException(
        'Airports cannot change after the flight has confirmed bookings.',
      );
    }

    if (cabins && Object.entries(cabins).some(([name, cabin]) =>
      flight.seatMaps?.[name]?.length && cabin.seatCount !== undefined && cabin.seatCount !== flight.cabins[name]?.seatCount)) {
      throw new BadRequestException('Cabin capacity cannot change after a seat map is configured');
    }
    // FLT-02, FLT-03: the same airport and time rules as on creation.
    const depCode = departureAirport ?? flight.departureAirport;
    const arrCode = arrivalAirport ?? flight.arrivalAirport;
    if (depCode === arrCode) {
      throw new BadRequestException('Departure and arrival airports must be different.');
    }
    const [depAirport, arrAirport] = await Promise.all([
      this.airportModel.findOne({ iataCode: depCode }).lean(),
      this.airportModel.findOne({ iataCode: arrCode }).lean(),
    ]);
    if (!depAirport || !arrAirport) {
      throw new BadRequestException('Invalid departure or arrival airport IATA code.');
    }
    const newDeparture = departureTimeLocal
      ? moment.tz(departureTimeLocal, depAirport.timeZone).utc().toDate()
      : departureTimeUtc
        ? new Date(departureTimeUtc)
        : flight.departureTimeUtc;
    const newArrival = arrivalTimeLocal
      ? moment.tz(arrivalTimeLocal, arrAirport.timeZone).utc().toDate()
      : arrivalTimeUtc
        ? new Date(arrivalTimeUtc)
        : flight.arrivalTimeUtc;
    const timesChanged =
      newDeparture.getTime() !== flight.departureTimeUtc.getTime() ||
      newArrival.getTime() !== flight.arrivalTimeUtc.getTime();
    if (timesChanged && newDeparture <= now) {
      throw new BadRequestException('Departure time cannot be in the past.');
    }
    if (newArrival <= newDeparture) {
      throw new BadRequestException('Arrival time must be after departure time in UTC.');
    }
    const departureDate = moment.tz(newDeparture, depAirport.timeZone).format('YYYY-MM-DD');
    if (departureDate !== flight.departureDate) {
      const duplicate = await this.flightModel.exists({
        _id: { $ne: flight._id },
        airlineId: flight.airlineId,
        flightNumber: flight.flightNumber,
        departureDate,
      });
      if (duplicate) {
        throw new BadRequestException(
          'An airline cannot have duplicate flight numbers on the same departure date.',
        );
      }
    }
    flight.departureAirport = depAirport.iataCode;
    flight.arrivalAirport = arrAirport.iataCode;
    flight.departureTimeUtc = newDeparture;
    flight.arrivalTimeUtc = newArrival;
    flight.departureDate = departureDate;

    // FLT-05: a cabin update keeps the cabin's other fields (e.g. FLT-04 baggage allowance) and the
    // cabins that were not sent, instead of replacing the whole cabin map.
    Object.assign(flight, rest);
    if (cabins) {
      const merged = { ...(flight.cabins ?? {}) };
      for (const [name, cabin] of Object.entries(cabins)) merged[name] = { ...merged[name], ...cabin };
      flight.cabins = merged;
      flight.markModified('cabins');
    }
    return flight.save();
  }
}
