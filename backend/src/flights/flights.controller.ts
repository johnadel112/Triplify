import { Controller, Get, Post, Patch, Body, Param, Query, Header, HttpCode } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { FlightsService } from './flights.service';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';
import { ConfirmationDto } from '../common/dto';
import { Roles, CurrentUser, Public } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import {
  AirlineProfileDto,
  CreateFlightDto,
  SearchFlightsQuery,
  UpdateFlightDto,
} from './flights.dto';

@Controller('flights')
export class FlightsController {
  constructor(
    private readonly flightsService: FlightsService,
    private readonly flightBookings: FlightBookingsService,
  ) {}

  /** The moderator's airline id, plus the legacy moderator user id used by older flights. */
  private airlineIds(user: Principal) {
    return [user.providerId, user.id].filter((id): id is string => Boolean(id));
  }

  @Patch('airline-profile')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'FLT-01: Edit my airline profile (name, logo, contact)' })
  async updateProfile(@CurrentUser() user: Principal, @Body() dto: AirlineProfileDto) {
    return this.flightsService.updateAirlineProfile(user.id, user.providerId!, dto);
  }

  @Post()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'FLT-03, FLT-04: Create a flight with cabins, prices, seats and baggage allowance' })
  async createFlight(@CurrentUser() user: Principal, @Body() dto: CreateFlightDto) {
    return this.flightsService.createFlight(user.providerId!, dto);
  }

  @Get('search')
  @Public()
  @ApiOperation({ summary: 'FLT-11, FLT-12, FLT-15: Search Scheduled flights (one-way or round trip) with filters and sorting' })
  async search(@Query() query: SearchFlightsQuery) {
    return this.flightsService.searchFlights(query);
  }

  @Get(':id/bookings')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary:
      'FLT-29: Bookings (reference, passengers, cabin, seats, status) and seats remaining for my flight',
  })
  async bookings(@CurrentUser() user: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.flightBookings.bookingsForFlight(id, this.airlineIds(user));
  }

  @Get(':id/passengers/export')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="passengers.csv"')
  @ApiOperation({ summary: 'FLT-29: Export confirmed passengers of my flight as CSV' })
  async exportPassengers(@CurrentUser() user: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.flightBookings.passengerManifestCsv(id, this.airlineIds(user));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary:
      'FLT-06: Cancel my Scheduled flight (confirmation: true); confirmed bookings are cancelled, refunded 100% and notified',
  })
  async cancel(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() _confirmation: ConfirmationDto,
  ) {
    return this.flightBookings.cancelFlightByProvider(id, this.airlineIds(user));
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'FLT-17: Flight details' })
  async getDetails(@Param('id', ObjectIdPipe) id: string) {
    return this.flightsService.getFlightById(id);
  }

  @Patch(':id')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'FLT-05: Edit my Scheduled flight (airports locked once bookings are confirmed)' })
  async updateFlight(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateFlightDto,
  ) {
    return this.flightsService.updateFlight(id, user.providerId!, dto, user.id);
  }
}
