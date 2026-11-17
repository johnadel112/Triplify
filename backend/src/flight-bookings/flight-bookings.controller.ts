import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards';
import { FlightBookingsService } from './flight-bookings.service';
import { CreateFlightBookingDto, HoldDto, ListBookingsQuery } from './flight-bookings.dto';

type AuthUser = { id: string };

@ApiTags('Flight Bookings')
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly service: FlightBookingsService) {}

  @Post() @ApiOperation({ summary: 'FLT-19/21: store passengers + baggage, return booking summary' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlightBookingDto) {
    return this.service.createDraft(user.id, dto);
  }

  @Post('hold') @ApiOperation({ summary: 'FLT-22: hold seats atomically for 10 minutes' })
  hold(@CurrentUser() user: AuthUser, @Body() dto: HoldDto) {
    return this.service.hold(user.id, dto.bookingId);
  }

  @Get() @ApiOperation({ summary: 'FLT-25: list bookings (tab=upcoming|past|cancelled)' })
  list(@CurrentUser() user: AuthUser, @Query() q: ListBookingsQuery) {
    return this.service.list(user.id, q);
  }

  @Get(':id') @ApiOperation({ summary: 'FLT-25: booking details' })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getOne(user.id, id);
  }

  @Get(':id/e-ticket') @ApiOperation({ summary: 'FLT-23: e-ticket for a confirmed booking' })
  eTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.eTicket(user.id, id);
  }

  @Post(':id/cancel') @ApiOperation({ summary: 'FLT-26: cancel and calculate refund per policy' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user.id, id);
  }
}