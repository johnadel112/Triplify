import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageDto } from '../common/dto';
import {
  HotelBookingGroup,
  MAX_ROOMS_PER_BOOKING,
  REVIEW_MAX_LENGTH,
} from './hotel-bookings.constants';
import { DATE_ONLY } from './stay-dates';

const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class RoomSelectionDto {
  @ApiProperty({ description: 'Room to reserve (must belong to the hotel)' })
  @IsMongoId()
  roomId!: string;

  @ApiProperty({ minimum: 1, maximum: 20, example: 2 })
  @IsInt()
  @Min(1)
  @Max(20)
  adults!: number;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Age of each child staying in this room (0-17)',
    example: [4, 9],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  childrenAges: number[] = [];
}

export class CreateHotelBookingDto {
  @ApiProperty() @IsMongoId() hotelId!: string;

  @ApiProperty({ example: '2026-12-20', description: 'Hotel-local check-in date' })
  @Matches(DATE_ONLY, { message: 'checkInDate must be YYYY-MM-DD' })
  checkInDate!: string;

  @ApiProperty({ example: '2026-12-23', description: 'Hotel-local check-out date' })
  @Matches(DATE_ONLY, { message: 'checkOutDate must be YYYY-MM-DD' })
  checkOutDate!: string;

  @ApiProperty({ type: [RoomSelectionDto], minItems: 1, maxItems: MAX_ROOMS_PER_BOOKING })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ROOMS_PER_BOOKING)
  @ValidateNested({ each: true })
  @Type(() => RoomSelectionDto)
  rooms!: RoomSelectionDto[];
}

export class HotelBookingListQuery extends PageDto {
  @ApiPropertyOptional({ enum: HotelBookingGroup, default: HotelBookingGroup.UPCOMING })
  @IsOptional()
  @IsIn(Object.values(HotelBookingGroup))
  group: HotelBookingGroup = HotelBookingGroup.UPCOMING;
}

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: REVIEW_MAX_LENGTH })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(REVIEW_MAX_LENGTH)
  text?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: REVIEW_MAX_LENGTH })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(REVIEW_MAX_LENGTH)
  text?: string;
}
