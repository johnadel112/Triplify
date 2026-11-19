import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class StayDatesQuery {
  @ApiProperty({ example: '2026-12-20', description: 'Inclusive hotel-local arrival date' })
  @Matches(DATE_ONLY)
  checkInDate!: string;

  @ApiProperty({ example: '2026-12-23', description: 'Exclusive hotel-local departure date' })
  @Matches(DATE_ONLY)
  checkOutDate!: string;
}

export class HotelSearchQuery extends StayDatesQuery {
  @ApiPropertyOptional({ example: 'Cairo' })
  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Egypt' })
  @IsOptional() @IsString() @MaxLength(100)
  country?: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  guests!: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 10, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  rooms = 1;

  @ApiPropertyOptional({ example: 50, minimum: 0, description: 'HTL-12: inclusive minimum, cheapest qualifying room per night' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 150, minimum: 0.01, description: 'HTL-12: inclusive maximum, cheapest qualifying room per night' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['price', 'rating'], default: 'price', description: 'HTL-12: cheapest stay first, or best rated first' })
  @IsOptional() @IsIn(['price', 'rating'])
  sortBy?: 'price' | 'rating';

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5, description: 'Average of visible reviews' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;
}

export class AvailableRoomsQuery extends StayDatesQuery {
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30)
  guests?: number;
}

export class RoomStatusQuery {
  @ApiProperty({ example: '2026-12-20', description: 'Inclusive calendar date' })
  @Matches(DATE_ONLY)
  from!: string;

  @ApiProperty({ example: '2026-12-23', description: 'Exclusive calendar date' })
  @Matches(DATE_ONLY)
  to!: string;
}
