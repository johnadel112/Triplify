import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetCategory, TransportType } from './itineraries.schema';

export class CreateItineraryDto {
  @ApiProperty({ example: 'Summer Trip to Europe', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty({ example: ['FR', 'GB'], description: 'List of country codes' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  countries!: string[];

  @ApiProperty({ example: '2026-07-01', description: 'Start date in YYYY-MM-DD format' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate!: string;

  @ApiPropertyOptional({ example: 'Exciting summer vacation exploring Paris and London' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateItineraryDto {
  @ApiPropertyOptional({ example: 'Updated Summer Trip to Europe', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: ['FR', 'GB'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @ApiPropertyOptional({ example: '2026-07-05' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: 'Updated itinerary description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class AddDayDto {
  @ApiProperty({ example: 'paris', description: 'Predefined city code' })
  @IsString()
  @IsNotEmpty()
  cityCode!: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  cityName?: string;

  @ApiPropertyOptional({ example: 'Exploring Museums' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  theme?: string;

  @ApiPropertyOptional({ example: 1, description: 'Optional insertion day number (1-based)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayNumber?: number;
}

export class UpdateDayDto {
  @ApiPropertyOptional({ example: 'paris' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cityCode?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  cityName?: string;

  @ApiPropertyOptional({ example: 'Louvre and Eiffel Tower' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  theme?: string;
}

export class ReorderDaysDto {
  @ApiProperty({
    example: ['660d1b2e8f1b2c0012a45678', '660d1b2e8f1b2c0012a45679'],
    description: 'All day IDs in the new desired order',
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  dayIds!: string[];
}

export class CreateActivityDto {
  @ApiProperty({ example: 'Visit the Louvre Museum', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ example: 'See the Mona Lisa and ancient sculptures' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiPropertyOptional({ example: 'Rue de Rivoli, 75001 Paris' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 22, description: 'Cost in the specified currency' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'EUR', description: '3-letter currency code' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}

export class UpdateActivityDto {
  @ApiPropertyOptional({ example: 'Visit the Louvre Museum (guided)', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: 'Guided tour of the main exhibits' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiPropertyOptional({ example: 'Rue de Rivoli, 75001 Paris' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 35 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}

export class CreateDayBudgetDto {
  @ApiProperty({ enum: BudgetCategory, example: BudgetCategory.FOOD })
  @IsEnum(BudgetCategory)
  category!: BudgetCategory;

  @ApiProperty({ example: 50, description: 'Budget amount' })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ example: 'EUR', description: '3-letter currency code' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency!: string;

  @ApiPropertyOptional({ example: 'Lunch and dinner at local bistros' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateDayBudgetDto {
  @ApiPropertyOptional({ enum: BudgetCategory, example: BudgetCategory.FOOD })
  @IsOptional()
  @IsEnum(BudgetCategory)
  category?: BudgetCategory;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency?: string;

  @ApiPropertyOptional({ example: 'Updated food budget' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateTransportCostDto {
  @ApiProperty({ example: 'paris', description: 'Origin city' })
  @IsString()
  @IsNotEmpty()
  fromCity!: string;

  @ApiProperty({ example: 'london', description: 'Destination city' })
  @IsString()
  @IsNotEmpty()
  toCity!: string;

  @ApiProperty({ enum: TransportType, example: TransportType.TRAIN })
  @IsEnum(TransportType)
  transportType!: TransportType;

  @ApiPropertyOptional({ example: '2026-07-03' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'departureDate must be in YYYY-MM-DD format' })
  departureDate?: string;

  @ApiProperty({ example: 85, description: 'Cost of intercity transport' })
  @IsNumber()
  @Min(0)
  cost!: number;

  @ApiProperty({ example: 'EUR', description: '3-letter currency code' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency!: string;

  @ApiPropertyOptional({ example: 'EUROSTAR-9021' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bookingReference?: string;

  @ApiPropertyOptional({ example: 'Eurostar standard ticket' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateTransportCostDto {
  @ApiPropertyOptional({ example: 'paris' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fromCity?: string;

  @ApiPropertyOptional({ example: 'london' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  toCity?: string;

  @ApiPropertyOptional({ enum: TransportType, example: TransportType.TRAIN })
  @IsOptional()
  @IsEnum(TransportType)
  transportType?: TransportType;

  @ApiPropertyOptional({ example: '2026-07-03' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'departureDate must be in YYYY-MM-DD format' })
  departureDate?: string;

  @ApiPropertyOptional({ example: 95 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency?: string;

  @ApiPropertyOptional({ example: 'EUROSTAR-9021' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bookingReference?: string;

  @ApiPropertyOptional({ example: 'Eurostar standard ticket' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CloneItineraryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Optional new start date for the cloned copy',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: 'My Custom Europe Trip', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

export class PublicItinerarySearchDto {
  @ApiPropertyOptional({ example: 'Europe', description: 'Search keywords in title/description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'FR', description: 'Country code filter' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'paris', description: 'City code filter' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 3, description: 'Minimum number of days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minDays?: number;

  @ApiPropertyOptional({ example: 14, description: 'Maximum number of days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDays?: number;

  @ApiPropertyOptional({ example: 'newest', enum: ['newest', 'duration', 'startDate', 'title'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

export class BudgetSummaryQueryDto {
  @ApiPropertyOptional({ example: 'USD', description: 'Target currency for budget conversion' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency?: string;
}
