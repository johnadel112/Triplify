import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { HotelReservationsQuery } from './hotel-reservations.dto';
import { HotelReservationsService } from './hotel-reservations.service';

@ApiTags('Hotel Moderator Reservations')
@ApiCookieAuth()
@Controller('hotels/:hotelId/reservations')
@Roles(UserRole.HOTEL_MODERATOR)
export class HotelReservationsController {
  constructor(private readonly reservations: HotelReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'HTL-22: Paginated bookings at the moderator assigned hotel (guest, dates, status)' })
  list(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Query() query: HotelReservationsQuery,
  ) {
    return this.reservations.list(hotelId, actor, query);
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'HTL-22: Details for a booking at the moderator assigned hotel' })
  getOne(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('bookingId', ObjectIdPipe) bookingId: string,
  ) {
    return this.reservations.getOne(hotelId, bookingId, actor);
  }
}
