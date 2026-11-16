import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { FlightsService } from './flights.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, Public } from '../auth/guards';
import { UserRole } from '../common/domain';

@Controller('flights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  @Patch('airline-profile')
  @Roles(UserRole.AIRLINE_MODERATOR)
  async updateProfile(@CurrentUser() user: any, @Body() dto: any) {
    return this.flightsService.updateAirlineProfile(user.id, dto);
  }

  @Post()
  @Roles(UserRole.AIRLINE_MODERATOR)
  async createFlight(@CurrentUser() user: any, @Body() dto: any) {
    return this.flightsService.createFlight(user.airlineId || user.id, dto);
  }

  @Get('search')
  @Public()
  async search(@Query() query: any) {
    return this.flightsService.searchFlights(query);
  }

  @Get(':id')
  @Public()
  async getDetails(@Param('id') id: string) {
    return this.flightsService.getFlightById(id);
  }

  @Patch(':id')
  @Roles(UserRole.AIRLINE_MODERATOR)
  async updateFlight(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.flightsService.updateFlight(id, user.airlineId || user.id, dto);
  }
}
