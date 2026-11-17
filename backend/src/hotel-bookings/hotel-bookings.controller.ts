import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { ConfirmationDto } from '../common/dto';
import { ObjectIdPipe } from '../common/http';
import {
  CreateHotelBookingDto,
  CreateReviewDto,
  HotelBookingListQuery,
} from './hotel-bookings.dto';
import { HotelBookingsService } from './hotel-bookings.service';
import { ReviewsService } from './reviews.service';

@ApiTags('Hotel Bookings')
@ApiCookieAuth()
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(
    private readonly bookings: HotelBookingsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Post()
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'HTL-16/HTL-18: reserve one or more rooms of one hotel for the same dates; holds all rooms together for 10 minutes as one Pending Payment reservation',
  })
  @ApiCreatedResponse({ description: 'Pending Payment reservation with holdExpiresAt and total' })
  @ApiConflictResponse({ description: 'ROOM_NOT_AVAILABLE / ROOM_ALREADY_RESERVED (nothing held)' })
  create(@CurrentUser() actor: Principal, @Body() dto: CreateHotelBookingDto) {
    return this.bookings.createHold(actor, dto);
  }

  @Get()
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'HTL-20: my reservations grouped as UPCOMING, PAST or CANCELLED (10 per page)',
  })
  list(@CurrentUser() actor: Principal, @Query() query: HotelBookingListQuery) {
    return this.bookings.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'HTL-20: reservation details (owner, or moderator of the hotel)' })
  @ApiNotFoundResponse({ description: 'BOOKING_NOT_FOUND' })
  get(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bookings.getOne(actor, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'HTL-17: confirm after the backend verifies a SUCCEEDED payment; generates the booking reference and notification',
  })
  @ApiOkResponse({ description: 'Confirmed reservation with reference' })
  @ApiConflictResponse({
    description: 'PAYMENT_NOT_VERIFIED / PAYMENT_AMOUNT_MISMATCH / HOLD_EXPIRED',
  })
  confirm(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bookings.confirm(actor, id);
  }

  @Get(':id/cancellation-quote')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-21: refund that would apply if cancelled now (hotel tiers)' })
  quote(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.bookings.cancellationQuote(actor, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'HTL-21: cancel a whole Confirmed reservation before the check-in date (requires confirmation: true); refunds per tiers',
  })
  @ApiConflictResponse({ description: 'BOOKING_NOT_CONFIRMED / CHECK_IN_DATE_REACHED' })
  cancel(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() _confirmation: ConfirmationDto,
  ) {
    return this.bookings.cancel(actor, id);
  }

  @Post(':id/review')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: one rating (1-5) and optional text per completed stay' })
  @ApiConflictResponse({ description: 'REVIEW_NOT_ELIGIBLE / REVIEW_ALREADY_EXISTS' })
  review(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(actor, id, dto);
  }
}
