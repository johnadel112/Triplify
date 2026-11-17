import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReportStatus, ReportTargetType } from './reports.schema';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, description: 'Type of content being reported' })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ description: 'ID of the post, comment, review, or itinerary' })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({ description: 'Reason for reporting this content', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class ResolveReportDto {
  @ApiProperty({
    enum: ['DISMISS', 'HIDE', 'DELETE'],
    description: 'Administrative action to resolve the report',
  })
  @IsEnum(['DISMISS', 'HIDE', 'DELETE'])
  action!: 'DISMISS' | 'HIDE' | 'DELETE';

  @ApiPropertyOptional({ description: 'Optional admin notes on resolution' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportTargetType })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}

