import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { Principal, UserRole } from '../common/domain';
import { PageDto } from '../common/dto';
import { ObjectIdPipe } from '../common/http';
import { UpdateReviewDto } from './hotel-bookings.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Hotel Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Patch('reviews/:id')
  @ApiCookieAuth()
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: edit my review' })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND (also for reviews of other users)' })
  update(
    @CurrentUser() actor: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(actor, id, dto);
  }

  @Delete('reviews/:id')
  @ApiCookieAuth()
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: delete my review' })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  remove(@CurrentUser() actor: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.reviews.remove(actor, id);
  }

  @Get('hotels/:id/reviews')
  @Public()
  @ApiOperation({
    summary: 'HTL-24: hotel average rating, rating count and reviews (newest first, 10 per page)',
  })
  list(@Param('id', ObjectIdPipe) id: string, @Query() query: PageDto) {
    return this.reviews.listForHotel(id, query.page);
  }
}
