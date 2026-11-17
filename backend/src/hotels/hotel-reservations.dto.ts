import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { HotelBookingStatus } from '../hotel-bookings/hotel-bookings.constants';

/** HTL-22: paginate moderator reservations; optionally select a lifecycle status. */
export class HotelReservationsQuery {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @ApiPropertyOptional({ enum: HotelBookingStatus })
  @IsOptional()
  @IsEnum(HotelBookingStatus)
  status?: HotelBookingStatus;
}
