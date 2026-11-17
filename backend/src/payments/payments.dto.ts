import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { BookingType } from './payments.constants';

export class CreatePaymentDto {
  @ApiProperty({ description: 'ID of the pending flight or hotel booking' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ enum: BookingType, description: 'FLIGHT or HOTEL' })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiPropertyOptional({
    description: 'Booking amount in platform currency (USD). If omitted, read from booking.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}

export class AcceptPoliciesDto {
  @ApiProperty({ description: 'Checkbox indicating explicit acceptance of provider policies' })
  @IsBoolean()
  accepted!: boolean;
}

export class ProcessRefundDto {
  @ApiProperty({ description: 'ID of the booking to refund' })
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiProperty({ enum: ['USER_CANCELLATION', 'PROVIDER_CANCELLATION'] })
  @IsEnum(['USER_CANCELLATION', 'PROVIDER_CANCELLATION'])
  reason!: 'USER_CANCELLATION' | 'PROVIDER_CANCELLATION';

  @ApiPropertyOptional({ description: 'Days before departure or check-in' })
  @IsOptional()
  @IsNumber()
  daysBefore?: number;
}

