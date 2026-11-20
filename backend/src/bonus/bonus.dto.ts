import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CABIN_KEYS } from '../flight-bookings/flight-booking.schema';
export class ReplyDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) text!: string;
}
export class BookingAttachmentDto {
  @ApiProperty({ enum: ['FLIGHT', 'HOTEL'] }) @IsIn(['FLIGHT', 'HOTEL']) type!: 'FLIGHT' | 'HOTEL';
  @ApiProperty() @IsMongoId() bookingId!: string;
}
export class ItineraryAttachmentDto {
  @ApiProperty() @IsMongoId() itineraryId!: string;
}
export class FavouriteDto {
  @ApiProperty({ enum: ['HOTEL', 'FLIGHT', 'ITINERARY', 'BLOG_POST'] })
  @IsIn(['HOTEL', 'FLIGHT', 'ITINERARY', 'BLOG_POST'])
  type!: 'HOTEL' | 'FLIGHT' | 'ITINERARY' | 'BLOG_POST';
  @ApiProperty() @IsMongoId() targetId!: string;
}
export class SeatMapDto {
  @ApiProperty({ enum: CABIN_KEYS }) @IsIn(CABIN_KEYS) cabinClass!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @Matches(/^[1-9][0-9]{0,2}[A-Z]$/, { each: true })
  seats!: string[];
}
export class SeatChoiceDto {
  @ApiProperty() @IsInt() @Min(0) @Max(1) legIndex!: number;
  @ApiProperty({
    type: [String],
    description: 'One seat per non-infant passenger, in passenger order',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ArrayUnique()
  @Matches(/^[1-9][0-9]{0,2}[A-Z]$/, { each: true })
  seats!: string[];
}
export class ChangeLegDto {
  @ApiProperty() @IsMongoId() flightId!: string;
  @ApiProperty({ enum: CABIN_KEYS }) @IsIn(CABIN_KEYS) cabinClass!: string;
}
export class ChangeFlightDto {
  @ApiProperty({ type: [ChangeLegDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ChangeLegDto)
  legs!: ChangeLegDto[];
}
