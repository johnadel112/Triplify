import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsMongoId,
  IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { CABIN_KEYS } from './flight-booking.schema';

export class LegDto {
  @IsMongoId() flightId!: string;
  @IsIn(CABIN_KEYS as unknown as string[]) cabinClass!: string;
}

export class PassengerDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsDateString() dateOfBirth!: string;
  @IsString() passportNumber!: string;
  @IsIn(['adult', 'child', 'infant']) type!: 'adult' | 'child' | 'infant';
  @IsOptional() @IsInt() @Min(0) @Max(50) extraBaggageKg?: number;
  /** FLT-19: extra bags; limited by the airline's maxExtraBagsPerPassenger (FLT-08). */
  @IsOptional() @IsInt() @Min(0) @Max(10) extraBags?: number;
}

export class CreateFlightBookingDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @ValidateNested({ each: true }) @Type(() => LegDto)
  legs!: LegDto[]; // 1 = one-way, 2 = round-trip (outbound first)

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(9) @ValidateNested({ each: true }) @Type(() => PassengerDto)
  passengers!: PassengerDto[];
}

export class HoldDto {
  @IsMongoId() bookingId!: string;
}

export class ListBookingsQuery {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'], default: 'upcoming' })
  @IsOptional() @IsIn(['upcoming', 'past', 'cancelled']) tab?: 'upcoming' | 'past' | 'cancelled';
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}