import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { Flight, AirlineProfile } from './flights.schema';
import { Airport } from '../reference-data/reference.schema';
import {
  PROVIDER_MANAGEMENT,
  ProviderManagementPort,
  NOTIFICATION_DELIVERY,
  NotificationDeliveryPort,
} from '../integrations/contracts';
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
  async updateAirlineProfile(userId: string, updateData: any, session?: ClientSession) {
    let profile = await this.airlineModel
      .findOne({ moderatorId: new Types.ObjectId(userId) })
      .session(session || null);
    if (!profile) {
      profile = new this.airlineModel({ moderatorId: new Types.ObjectId(userId), ...updateData });
    } else {
      Object.assign(profile, updateData);
    }
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
  async createFlight(airlineId: string, dto: any) {
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

    for (const [cabinName, cabinData] of Object.entries(cabins) as [string, any][]) {
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
  async searchFlights(queryDto: any) {
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

    const query: any = {
      departureAirport: origin,
      arrivalAirport: destination,
      [`cabins.${cabinClass}.seatCount`]: { $gte: Number(passengers) },
    };

    if (date) query.departureDate = date;
    if (maxPrice) query[`cabins.${cabinClass}.price`] = { $lte: Number(maxPrice) };

    let dbQuery = this.flightModel.find(query);
    if (sortBy === 'price') dbQuery = dbQuery.sort({ [`cabins.${cabinClass}.price`]: 1 });
    if (sortBy === 'duration') dbQuery = dbQuery.sort({ departureTimeUtc: 1 });

    const outbound = await dbQuery.exec();

    let returnFlights: any[] = [];
    if (returnDate) {
      const returnQuery = {
        departureAirport: destination,
        arrivalAirport: origin,
        departureDate: returnDate,
        [`cabins.${cabinClass}.seatCount`]: { $gte: Number(passengers) },
      };
      returnFlights = await this.flightModel.find(returnQuery).exec();
    }

    return { outbound, return: returnDate ? returnFlights : undefined };
  }

  // FLT-15, FLT-17: Flight Detail & Moderator Passenger Views
  async getFlightById(flightId: string) {
    const flight = await this.flightModel.findById(flightId).populate('airlineId');
    if (!flight) throw new NotFoundException('Flight not found');
    return flight;
  }

  // FLT-29, FLT-30: Automatic status transitions & airport locking rules
  async updateFlight(flightId: string, airlineId: string, updateDto: any) {
    const flight = await this.flightModel.findById(flightId);
    if (!flight) throw new NotFoundException('Flight not found');

    if (flight.airlineId?.toString() !== airlineId) {
      throw new ForbiddenException('You can only modify flights belonging to your airline.');
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
