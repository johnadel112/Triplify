import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CancellationTierDto {
  @ApiPropertyOptional({ example: 7, minimum: 0, description: 'Days prior to check-in' })
  @IsInt()
  @Min(0)
  daysBefore!: number;

  @ApiPropertyOptional({ example: 75, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercentage!: number;
}

export class UpdateHotelPoliciesDto {
  @ApiPropertyOptional({ example: '14:00', description: '24-hour local hotel time' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkInTime?: string;

  @ApiPropertyOptional({ example: '11:00', description: '24-hour local hotel time' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkOutTime?: string;

  @ApiPropertyOptional({ type: [CancellationTierDto], example: [
    { daysBefore: 7, refundPercentage: 100 },
    { daysBefore: 2, refundPercentage: 50 },
    { daysBefore: 0, refundPercentage: 0 },
  ] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  cancellationTiers?: CancellationTierDto[];
}
