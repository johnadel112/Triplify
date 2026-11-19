import { Delete, Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { CreateRoomDto, SetRoomStatusDto, UpdateRoomDto } from './room.dto';
import { ReplaceRoomRangesDto } from './room-availability.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Hotel Rooms')
@ApiCookieAuth()
@Controller('hotels/:hotelId/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Create an individually bookable room (unique name and number per hotel)' })
  create(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.rooms.create(hotelId, dto, actor);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active physical rooms in an active hotel' })
  listPublic(@Param('hotelId', ObjectIdPipe) hotelId: string) {
    return this.rooms.listPublic(hotelId);
  }

  @Get('manage')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'List all assigned hotel rooms, including inactive rooms' })
  listForModerator(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
  ) {
    return this.rooms.listForModerator(hotelId, actor);
  }

  @Get(':roomId')
  @Public()
  @ApiOperation({ summary: 'View a specific active room' })
  getPublic(
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
  ) {
    return this.rooms.getPublic(hotelId, roomId);
  }

  @Patch(':roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Edit room name/number, type, beds, maximum occupancy, or price' })
  update(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.rooms.update(hotelId, roomId, dto, actor);
  }

  @Patch(':roomId/status')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Activate/deactivate room (cannot deactivate with active reservations)' })
  setStatus(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
    @Body() dto: SetRoomStatusDto,
  ) {
    return this.rooms.setStatus(hotelId, roomId, dto, actor);
  }

  @Delete(':roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-06: Delete a room (rejected while it has pending or confirmed reservations)' })
  remove(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
  ) {
    return this.rooms.remove(hotelId, roomId, actor);
  }

  @Put(':roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-04: Replace all availability date ranges (no overlaps, preserve reserved nights)' })
  replaceAvailability(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
    @Body() dto: ReplaceRoomRangesDto,
  ) {
    return this.rooms.replaceAvailability(hotelId, roomId, dto, actor);
  }

  @Put(':roomId/blocked')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-06: Replace blocked date ranges (reject any pending/confirmed reservation overlap)' })
  replaceBlocked(
    @CurrentUser() actor: Principal,
    @Param('hotelId', ObjectIdPipe) hotelId: string,
    @Param('roomId', ObjectIdPipe) roomId: string,
    @Body() dto: ReplaceRoomRangesDto,
  ) {
    return this.rooms.replaceBlocked(hotelId, roomId, dto, actor);
  }
}
