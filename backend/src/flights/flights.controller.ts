import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { FlightsService } from './flights.service';
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
  constructor(private readonly flightsService: FlightsService) {}

  @Patch('airline-profile')
  @Roles(UserRole.AIRLINE_MODERATOR)
  async updateProfile(@CurrentUser() user: Principal, @Body() dto: AirlineProfileDto) {
    return this.flightsService.updateAirlineProfile(user.id, user.providerId!, dto);
  }

  @Post()
  @Roles(UserRole.AIRLINE_MODERATOR)
  async createFlight(@CurrentUser() user: Principal, @Body() dto: CreateFlightDto) {
    return this.flightsService.createFlight(user.providerId!, dto);
  }

  @Get('search')
  @Public()
  async search(@Query() query: SearchFlightsQuery) {
    return this.flightsService.searchFlights(query);
  }

  @Get(':id')
  @Public()
  async getDetails(@Param('id', ObjectIdPipe) id: string) {
    return this.flightsService.getFlightById(id);
  }

  @Patch(':id')
  @Roles(UserRole.AIRLINE_MODERATOR)
  async updateFlight(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateFlightDto,
  ) {
    return this.flightsService.updateFlight(id, user.providerId!, dto, user.id);
  }
}
