import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountStatus, CLOCK, Clock, Principal } from '../common/domain';
import { AccessPolicy } from '../common/policies';
import { User } from '../users/user.schema';
import { HotelBooking } from './hotel-booking.schema';
import { HotelBookingStatus, PAGE_SIZE } from './hotel-bookings.constants';
import { CreateReviewDto, UpdateReviewDto } from './hotel-bookings.dto';
import { HotelBookingsService } from './hotel-bookings.service';
import { Review, ReviewDocument } from './review.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBooking>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly hotelBookings: HotelBookingsService,
    private readonly policy: AccessPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** HTL-23: exactly one review per COMPLETED reservation, by its owner. */
  async create(actor: Principal, bookingId: string, dto: CreateReviewDto) {
    const bookingObjectId = new Types.ObjectId(bookingId);
    await this.hotelBookings.completeDueStays(this.clock.now(), { _id: bookingObjectId });
    const booking = await this.bookings.findOne({
      _id: bookingObjectId,
      userId: new Types.ObjectId(actor.id),
    });
    if (!booking)
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Reservation not found' });
    if (booking.status !== HotelBookingStatus.COMPLETED)
      throw new ConflictException({
        code: 'REVIEW_NOT_ELIGIBLE',
        message: 'Only completed stays can be reviewed',
      });
    try {
      const review = await this.reviews.create({
        bookingId: booking._id,
        hotelId: booking.providerId,
        userId: booking.userId,
        rating: dto.rating,
        text: dto.text || undefined,
      });
      return this.toView(review, actor.name);
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new ConflictException({
          code: 'REVIEW_ALREADY_EXISTS',
          message: 'This reservation has already been reviewed',
        });
      throw error;
    }
  }

  async update(actor: Principal, reviewId: string, dto: UpdateReviewDto) {
    if (dto.rating === undefined && dto.text === undefined)
      throw new BadRequestException({
        code: 'NOTHING_TO_UPDATE',
        message: 'Provide a rating or text to update',
      });
    const review = await this.findOwn(actor, reviewId);
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.text !== undefined) review.text = dto.text || undefined;
    await review.save();
    return this.toView(review, actor.name);
  }

  async remove(actor: Principal, reviewId: string) {
    const result = await this.reviews.deleteOne({
      _id: new Types.ObjectId(reviewId),
      userId: new Types.ObjectId(actor.id),
    });
    if (!result.deletedCount) throw this.notFound();
    return { deleted: true };
  }

  /** HTL-24: average rating, rating count and reviews newest first, 10 per page. */
  async listForHotel(hotelId: string, page = 1) {
    const filter = { hotelId: new Types.ObjectId(hotelId), hidden: false };
    const [items, total, summary] = await Promise.all([
      this.reviews
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.reviews.countDocuments(filter),
      this.getRatingSummaries([hotelId]),
    ]);
    const authors = await this.users
      .find({ _id: { $in: items.map((r) => r.userId) } }, { name: 1, status: 1 })
      .lean();
    const byId = new Map(authors.map((a) => [a._id.toString(), a]));
    const rating = summary.get(hotelId) ?? { averageRating: null, ratingCount: 0 };
    return {
      hotelId,
      averageRating: rating.averageRating,
      ratingCount: rating.ratingCount,
      items: items.map((review) => {
        const author = byId.get(review.userId.toString());
        // ACC-12: reviews of deactivated accounts are attributed to "Deleted user".
        const name = author
          ? this.policy.contentVisibility(author.status ?? AccountStatus.ACTIVE, author.name)
              .attribution
          : 'Deleted user';
        return this.toView(review, name);
      }),
      total,
      page,
      pageCount: Math.ceil(total / PAGE_SIZE),
    };
  }

  /** HTL-02 / HTL-12 (Magdy): average rating (1 decimal) and count per hotel. */
  async getRatingSummaries(hotelIds: string[]) {
    const rows = await this.reviews.aggregate<{ _id: Types.ObjectId; avg: number; n: number }>([
      {
        $match: { hotelId: { $in: hotelIds.map((id) => new Types.ObjectId(id)) }, hidden: false },
      },
      { $group: { _id: '$hotelId', avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]);
    return new Map(
      rows.map((r) => [
        r._id.toString(),
        { averageRating: Math.round(r.avg * 10) / 10, ratingCount: r.n },
      ]),
    );
  }

  /** GEN-10 (Divan/John): hide or unhide a reported review. */
  async setHidden(reviewId: string, hidden: boolean) {
    const result = await this.reviews.updateOne(
      { _id: new Types.ObjectId(reviewId) },
      { $set: { hidden } },
    );
    if (!result.matchedCount) throw this.notFound();
  }

  /** GEN-10 (Divan/John): delete a reported review. */
  async deleteByModeration(reviewId: string) {
    const result = await this.reviews.deleteOne({ _id: new Types.ObjectId(reviewId) });
    if (!result.deletedCount) throw this.notFound();
  }

  private async findOwn(actor: Principal, reviewId: string) {
    const review = await this.reviews.findOne({
      _id: new Types.ObjectId(reviewId),
      userId: new Types.ObjectId(actor.id),
    });
    if (!review) throw this.notFound();
    return review;
  }

  private notFound() {
    return new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });
  }

  private toView(review: ReviewDocument, authorName: string) {
    return {
      id: review.id as string,
      bookingId: review.bookingId.toString(),
      hotelId: review.hotelId.toString(),
      author: { id: review.userId.toString(), name: authorName },
      rating: review.rating,
      text: review.text ?? null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
