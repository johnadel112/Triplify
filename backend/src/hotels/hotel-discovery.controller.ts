import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { AvailableRoomsQuery, HotelSearchQuery, RoomStatusQuery } from './hotel-discovery.dto';
import { HotelDiscoveryService } from './hotel-discovery.service';

@ApiTags('Hotel Discovery')
@ApiCookieAuth()
@Controller('hotels')
export class HotelDiscoveryController {
  constructor(private readonly discovery: HotelDiscoveryService) {}

  // Register this controller before HotelsController so /hotels/search isn't treated as an ID.
  @Public()
  @Get('search')
  @ApiOperation({ summary: 'HTL-11/12: Search by city/country, stay dates, guests, rooms, min/max price, average rating' })
  search(@Query() query: HotelSearchQuery) {
    return this.discovery.search(query);
  }

  @Public()
  @Get(':hotelId/available-rooms')
  @ApiOperation({ summary: 'HTL-15: All free individual rooms and their stay totals for a hotel and date range' })
  availableRooms(
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Query() query: AvailableRoomsQuery,
  ) {
    return this.discovery.availableRooms(hotelId, query);
  }

  @Get(':hotelId/rooms/:roomId/status')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-08: Room status for each night, with reservation reference when booked' })
  roomStatus(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
    @Query() query: RoomStatusQuery,
  ) {
    return this.discovery.roomStatus(hotelId, roomId, query, actor);
  }
}
