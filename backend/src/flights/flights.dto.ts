import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';

export const CABIN_CLASSES = ['economy', 'premiumEconomy', 'business', 'first'] as const;
export type CabinClass = (typeof CABIN_CLASSES)[number];
export type CabinMap = Partial<Record<CabinClass, { seatCount: number; price: number }>>;

const IATA = /^[A-Z]{3}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * FLT-04: cabins is a plain object keyed by the fixed cabin set, each with a whole-number seat
 * count and a positive price. Kept as a plain object (not a nested class) because flight bookings
 * address seats as cabins.<cabin>.seatCount and the service iterates its entries.
 */
function IsCabinMap(minSeats: number, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCabinMap',
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          const entries = Object.entries(value as Record<string, unknown>);
          return (
            entries.length > 0 &&
            entries.every(([key, cabin]) => {
              if (!(CABIN_CLASSES as readonly string[]).includes(key)) return false;
              if (typeof cabin !== 'object' || cabin === null) return false;
              const { seatCount, price, ...rest } = cabin as Record<string, unknown>;
              return (
                Object.keys(rest).length === 0 &&
                Number.isInteger(seatCount) &&
                (seatCount as number) >= minSeats &&
                typeof price === 'number' &&
                price > 0
              );
            })
          );
        },
        defaultMessage: () =>
          `cabins must use only ${CABIN_CLASSES.join(', ')}, each with an integer seatCount >= ${minSeats} and a positive price`,
      },
    },
    options,
  );
}

export class CancellationTierDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) hoursBeforeDeparture!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) refundPercentage!: number;
}

/** FLT-01: fields an airline moderator may edit on their own airline profile. */
export class AirlineProfileDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

/** FLT-03/FLT-04: create a flight; times are in each airport's local time. */
export class CreateFlightDto {
  @ApiProperty({ example: 'MS777' })
  @IsString()
  @Matches(/^[A-Z0-9]{2,8}$/, { message: 'flightNumber must be 2-8 uppercase letters/digits' })
  flightNumber!: string;

  @ApiProperty({ example: 'CAI' })
  @Matches(IATA, { message: 'departureAirportCode must be a 3-letter IATA code' })
  departureAirportCode!: string;

  @ApiProperty({ example: 'JFK' })
  @Matches(IATA, { message: 'arrivalAirportCode must be a 3-letter IATA code' })
  arrivalAirportCode!: string;

  @ApiProperty({ example: '2026-12-20T10:30', description: 'Local time at departure airport' })
  @Matches(LOCAL_DATE_TIME, { message: 'departureTimeLocal must be YYYY-MM-DDTHH:mm' })
  departureTimeLocal!: string;

  @ApiProperty({ example: '2026-12-20T18:45', description: 'Local time at arrival airport' })
  @Matches(LOCAL_DATE_TIME, { message: 'arrivalTimeLocal must be YYYY-MM-DDTHH:mm' })
  arrivalTimeLocal!: string;

  @ApiProperty({ example: { economy: { seatCount: 150, price: 320 } } })
  @IsCabinMap(1)
  cabins!: CabinMap;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  extraBaggagePricePerKg?: number;

  @ApiPropertyOptional({ type: [CancellationTierDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  cancellationTiers?: CancellationTierDto[];
}

/**
 * FLT-05: editable fields of a Scheduled flight. airlineId, status, departureDate and
 * hasConfirmedBookings are server-controlled and therefore not accepted here.
 */
export class UpdateFlightDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  departureTimeUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  arrivalTimeUtc?: string;

  @ApiPropertyOptional({ example: 'CAI' })
  @IsOptional()
  @Matches(IATA)
  departureAirport?: string;

  @ApiPropertyOptional({ example: 'JFK' })
  @IsOptional()
  @Matches(IATA)
  arrivalAirport?: string;

  @ApiPropertyOptional({ description: 'Seat counts may be 0 once a cabin is sold out' })
  @IsOptional()
  @IsCabinMap(0)
  cabins?: CabinMap;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  extraBaggagePricePerKg?: number;

  @ApiPropertyOptional({ type: [CancellationTierDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  cancellationTiers?: CancellationTierDto[];
}

/** FLT-11/12/15: one-way or round-trip search. */
export class SearchFlightsQuery {
  @ApiProperty({ example: 'CAI' }) @Matches(IATA) origin!: string;
  @ApiProperty({ example: 'JFK' }) @Matches(IATA) destination!: string;

  @ApiPropertyOptional({ example: '2026-12-20' })
  @IsOptional()
  @Matches(DATE_ONLY)
  date?: string;

  @ApiPropertyOptional({ example: '2026-12-27' })
  @IsOptional()
  @Matches(DATE_ONLY)
  returnDate?: string;

  @ApiPropertyOptional({ enum: CABIN_CLASSES, default: 'economy' })
  @IsOptional()
  @IsIn(CABIN_CLASSES)
  cabinClass: CabinClass = 'economy';

  @ApiPropertyOptional({ minimum: 1, maximum: 9, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  passengers = 1;

  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['price', 'duration'] })
  @IsOptional()
  @IsIn(['price', 'duration'])
  sortBy?: 'price' | 'duration';
}
