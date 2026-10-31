import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { AccountFilters, BookingFilters, ModeratorDto } from '../common/dto';
import { ObjectIdPipe } from '../common/http';
import { AdminService } from './admin.service';
@ApiTags('Administration')
@ApiCookieAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}
  @Get('users') @ApiOperation({ summary: 'List accounts, 10 per page' }) list(
    @Query() query: AccountFilters,
  ) {
    return this.admin.list(query);
  }
  @Post('moderators')
  @ApiOperation({ summary: 'Create provider-linked moderator with temporary password' })
  moderator(@CurrentUser() actor: Principal, @Body() dto: ModeratorDto) {
    return this.admin.moderator(actor, dto);
  }
  @Post('users/:id/reset-password')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Display a generated temporary password once' })
  reset(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.reset(actor, id);
  }
  @Patch('users/:id/suspend') @ApiOperation({ summary: 'Suspend ordinary user' }) suspendUser(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.admin.status(actor, id, false, false);
  }
  @Patch('users/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate suspended ordinary user' })
  reactivateUser(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.status(actor, id, true, false);
  }
  @Patch('moderators/:id/suspend') @ApiOperation({ summary: 'Suspend moderator' }) suspendModerator(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.admin.status(actor, id, false, true);
  }
  @Patch('moderators/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate suspended moderator' })
  reactivateModerator(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.status(actor, id, true, true);
  }
  @Patch('providers/hotels/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate actual hotel through provider adapter' })
  deactivateHotel(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.provider(actor, 'HOTEL', id, false);
  }
  @Patch('providers/hotels/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate actual hotel through provider adapter' })
  reactivateHotel(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.provider(actor, 'HOTEL', id, true);
  }
  @Patch('providers/airlines/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate actual airline through provider adapter' })
  deactivateAirline(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.provider(actor, 'AIRLINE', id, false);
  }
  @Patch('providers/airlines/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate actual airline through provider adapter' })
  reactivateAirline(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.admin.provider(actor, 'AIRLINE', id, true);
  }
  @Get('bookings')
  @ApiOperation({ summary: 'Read-only normalized booking oversight through teammate adapter' })
  bookings(@Query() query: BookingFilters) {
    return this.admin.findBookings(query);
  }
}
