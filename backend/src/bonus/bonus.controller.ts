import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ObjectIdPipe } from '../common/http';
import { PageDto } from '../common/dto';
import { BonusService } from './bonus.service';
import { FlightExtrasService } from './flight-extras.service';
import {
  BookingAttachmentDto,
  ChangeFlightDto,
  FavouriteDto,
  ItineraryAttachmentDto,
  ReplyDto,
  SeatChoiceDto,
  SeatMapDto,
} from './bonus.dto';

@ApiTags('Bonus features')
@ApiCookieAuth()
@Controller()
export class BonusController {
  constructor(
    private bonus: BonusService,
    private flights: FlightExtrasService,
  ) {}
  @Put('reviews/:id/reply')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Reply to a review of the assigned hotel' })
  reply(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.bonus.reply(actor, id, dto.text);
  }
  @Delete('reviews/:id/reply')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Remove the assigned hotel moderator reply' })
  removeReply(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bonus.reply(actor, id);
  }
  @Post('itineraries/:id/bookings')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Attach my confirmed flight or hotel booking to my itinerary' })
  attachBooking(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: BookingAttachmentDto,
  ) {
    return this.bonus.attachBooking(actor, id, dto);
  }
  @Get('itineraries/:id/bookings')
  @ApiOperation({
    summary: 'List booking attachments; owner only, including current booking status',
  })
  bookings(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bonus.attachedBookings(actor, id);
  }
  @Delete('itineraries/:id/bookings/:attachmentId')
  @ApiOperation({ summary: 'Detach a booking from my itinerary' })
  detach(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Param('attachmentId', ObjectIdPipe) attachmentId: string,
  ) {
    return this.bonus.detachBooking(actor, id, attachmentId);
  }
  @Get('itineraries/:id/export.pdf')
  @ApiOperation({ summary: 'Download my itinerary, budgets and booking summaries as a PDF' })
  @ApiOkResponse({
    description: 'PDF document',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  async pdf(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Res() response: Response,
  ) {
    const buffer = await this.bonus.exportPdf(actor, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="itinerary-${id}.pdf"`);
    response.send(buffer);
  }
  @Put('blog/posts/:id/itinerary')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Attach my public itinerary to my blog post' })
  attachItinerary(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: ItineraryAttachmentDto,
  ) {
    return this.bonus.attachItinerary(actor, id, dto.itineraryId);
  }
  @Delete('blog/posts/:id/itinerary')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Remove my blog post itinerary attachment' })
  detachItinerary(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bonus.attachItinerary(actor, id);
  }
  @Post('favourites')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Save a public hotel, flight, itinerary or blog post to favourites' })
  favourite(@CurrentUser() actor: Principal, @Body() dto: FavouriteDto) {
    return this.bonus.favourite(actor, dto);
  }
  @Get('favourites')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'List my favourites; inaccessible targets are redacted' })
  favourites(@CurrentUser() actor: Principal, @Query() dto: PageDto) {
    return this.bonus.listFavourites(actor, dto.page);
  }
  @Delete('favourites/:id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Remove my favourite' })
  unfavourite(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bonus.unfavourite(actor, id);
  }
  @Get('admin/analytics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'All-time counts, booking statuses and payment/refund revenue by currency',
  })
  analytics() {
    return this.bonus.analytics();
  }
  @Put('flights/:id/seat-map')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Configure cabin seats before any bookings are held or confirmed' })
  seatMap(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: SeatMapDto,
  ) {
    return this.flights.configureSeats(actor, id, dto);
  }
  @Get('flight-bookings/:id/seat-map/:legIndex')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'List available seats for a leg of my booking' })
  seats(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Param('legIndex', ParseIntPipe) legIndex: number,
  ) {
    return this.flights.seatMap(actor, id, legIndex);
  }
  @Put('flight-bookings/:id/seats')
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'Select one free seat per non-infant passenger on a held or confirmed leg',
  })
  selectSeats(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: SeatChoiceDto,
  ) {
    return this.flights.selectSeats(actor, id, dto);
  }
  @Patch('flight-bookings/:id/change')
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'Change upcoming confirmed flights at the same fare, airline, route and cabin',
  })
  change(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: ChangeFlightDto,
  ) {
    return this.flights.change(actor, id, dto);
  }
}
