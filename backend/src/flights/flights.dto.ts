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
export type CabinMap = Partial<
  Record<
    CabinClass,
    { seatCount: number; price: number; freeBags?: number; maxBagWeightKg?: number }
  >
>;

const IATA = /^[A-Z]{3}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * FLT-04: cabins is a plain object keyed by the fixed cabin set, each with a whole-number seat
 * count, a positive price, a free baggage allowance (bag count) and a maximum weight per bag (kg).
 * Kept as a plain object (not a nested class) because flight bookings address seats as
 * cabins.<cabin>.seatCount and the service iterates its entries.
 */
function IsCabinMap(minSeats: number, requireBaggage: boolean, options?: ValidationOptions) {
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
              const { seatCount, price, freeBags, maxBagWeightKg, ...rest } = cabin as Record<
                string,
                unknown
              >;
              const bagsOk =
                freeBags === undefined
                  ? !requireBaggage
                  : Number.isInteger(freeBags) && (freeBags as number) >= 0 && (freeBags as number) <= 10;
              const weightOk =
                maxBagWeightKg === undefined
                  ? !requireBaggage
                  : typeof maxBagWeightKg === 'number' && maxBagWeightKg > 0 && maxBagWeightKg <= 50;
              return (
                Object.keys(rest).length === 0 &&
                Number.isInteger(seatCount) &&
                (seatCount as number) >= minSeats &&
                typeof price === 'number' &&
                price > 0 &&
                bagsOk &&
                weightOk
              );
            })
          );
        },
        defaultMessage: () =>
          `cabins must use only ${CABIN_CLASSES.join(', ')}, each with an integer seatCount >= ${minSeats}, a positive price` +
          `${requireBaggage ? ', ' : ' and optionally '}freeBags (0-10 bags) and maxBagWeightKg (0-50 kg)`,
      },
    },
    options,
  );
}

/** FLT-08: airline-wide extra baggage pricing. */
export class BaggagePolicyDto {
  @ApiProperty({ minimum: 0.01, example: 45 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  extraBagPrice!: number;

  @ApiProperty({ minimum: 0, maximum: 10, example: 2 })
  @IsInt()
  @Min(0)
  @Max(10)
  maxExtraBagsPerPassenger!: number;
}

export class AirlineCancellationTierDto {
  @ApiProperty({ minimum: 0, example: 7 }) @IsInt() @Min(0) @Max(365) daysBefore!: number;
  @ApiProperty({ minimum: 0, maximum: 100, example: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercentage!: number;
}

/** FLT-09: airline-wide cancellation tiers with unique days-before-departure thresholds. */
export class AirlineCancellationPolicyDto {
  @ApiProperty({ type: [AirlineCancellationTierDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AirlineCancellationTierDto)
  tiers!: AirlineCancellationTierDto[];
}

export class CancellationTierDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) hoursBeforeDeparture!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) refundPercentage!: number;
}

/** FLT-01: fields an airline moderator may edit on their own airline profile. */
export class AirlineProfileDto {
  @ApiPropertyOptional({ example: 'NA', description: 'Two-character airline code' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{2}$/, { message: 'code must be 2 uppercase letters/digits' })
  code?: string;

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

/** FLT-01: an administrator creates an airline profile. */
export class CreateAirlineDto {
  @ApiPropertyOptional({ example: 'NA', description: 'Two-character airline code' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{2}$/, { message: 'code must be 2 uppercase letters/digits' })
  code?: string;

  @ApiProperty({ maxLength: 100, example: 'Nile Air' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

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

  @ApiProperty({
    example: { economy: { seatCount: 150, price: 320, freeBags: 1, maxBagWeightKg: 23 } },
  })
  @IsCabinMap(1, true)
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
  /** FLT-05, GEN-06: new times are entered in each airport's local time, like on creation. */
  @ApiPropertyOptional({ example: '2026-12-20T11:00', description: 'Local time at the departure airport' })
  @IsOptional()
  @Matches(LOCAL_DATE_TIME)
  departureTimeLocal?: string;

  @ApiPropertyOptional({ example: '2026-12-20T19:15', description: 'Local time at the arrival airport' })
  @IsOptional()
  @Matches(LOCAL_DATE_TIME)
  arrivalTimeLocal?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Alternative to departureTimeLocal (UTC)' })
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
  @IsCabinMap(0, false)
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

  /** FLT-11: passenger types; when adults is given, seats needed = adults + children (infants sit on a lap). */
  @ApiPropertyOptional({ minimum: 1, maximum: 9, description: 'Adults (overrides passengers)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 8, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8)
  children?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9, default: 0, description: 'At most one infant per adult' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infants?: number;

  /** GEN-05: 10 results per page for each direction. */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 0, description: 'FLT-15: inclusive minimum price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0.01, description: 'FLT-15: inclusive maximum price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['price', 'duration', 'departureTime'] })
  @IsOptional()
  @IsIn(['price', 'duration', 'departureTime'])
  sortBy?: 'price' | 'duration' | 'departureTime';
}
