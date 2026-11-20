import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Itinerary, ItinerarySchema } from '../itineraries/itineraries.schema';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/flight-booking.schema';
import { HotelBooking, HotelBookingSchema } from '../hotel-bookings/hotel-booking.schema';
import { Review, ReviewSchema } from '../hotel-bookings/review.schema';
import { Hotel, HotelSchema } from '../hotels/hotel.schema';
import {
  AirlineProfile,
  AirlineProfileSchema,
  Flight,
  FlightSchema,
} from '../flights/flights.schema';
import { BlogPost, BlogPostSchema } from '../blog/blog-post.schema';
import { User, UserSchema } from '../users/user.schema';
import { Payment, PaymentSchema, Refund, RefundSchema } from '../payments/payments.schema';
import { Notification, NotificationSchema } from '../notifications/notifications.schema';
import {
  BookingAttachment,
  BookingAttachmentSchema,
  Favourite,
  FavouriteSchema,
} from './bonus.schema';
import { BonusController } from './bonus.controller';
import { BonusService } from './bonus.service';
import { FlightExtrasService } from './flight-extras.service';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Itinerary.name, schema: ItinerarySchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Flight.name, schema: FlightSchema },
      { name: AirlineProfile.name, schema: AirlineProfileSchema },
      { name: BlogPost.name, schema: BlogPostSchema },
      { name: User.name, schema: UserSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: BookingAttachment.name, schema: BookingAttachmentSchema },
      { name: Favourite.name, schema: FavouriteSchema },
    ]),
  ],
  controllers: [BonusController],
  providers: [BonusService, FlightExtrasService],
})
export class BonusModule {}
