import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HotelBooking, HotelBookingSchema, RoomNightLock, RoomNightLockSchema,
} from '../hotel-bookings/hotel-booking.schema';
import { Review, ReviewSchema } from '../hotel-bookings/review.schema';
import { User, UserSchema } from '../users/user.schema';
import { Hotel, HotelSchema } from './hotel.schema';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { Room, RoomSchema } from './room.schema';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { HotelDiscoveryController } from './hotel-discovery.controller';
import { HotelDiscoveryService } from './hotel-discovery.service';
import { HotelReservationsController } from './hotel-reservations.controller';
import { HotelReservationsService } from './hotel-reservations.service';
import { HotelInventoryAdapter } from './hotel-inventory.adapter';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: RoomNightLock.name, schema: RoomNightLockSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  // Discovery first so /hotels/search is not parsed as /hotels/:id.
  controllers: [
    HotelDiscoveryController,
    HotelsController,
    RoomsController,
    HotelReservationsController,
  ],
  providers: [
    HotelsService,
    RoomsService,
    HotelDiscoveryService,
    HotelReservationsService,
    HotelInventoryAdapter,
  ],
  exports: [
    HotelsService,
    RoomsService,
    HotelDiscoveryService,
    HotelReservationsService,
    HotelInventoryAdapter,
  ],
})
export class HotelsModule {}
