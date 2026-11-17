import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class CreateRoomDto {
  @ApiProperty({ example: 'Deluxe King 301', maxLength: 100 })
  @Trim() @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '301', description: 'Physical room number unique within this hotel' })
  @Trim() @IsString() @MinLength(1) @MaxLength(40)
  number!: string;

  @ApiProperty({ example: 'DELUXE_KING' })
  @Trim() @IsString() @MinLength(1) @MaxLength(100)
  type!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 20 })
  @IsInt() @Min(1) @Max(20)
  beds!: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 30 })
  @IsInt() @Min(1) @Max(30)
  maxOccupancy!: number;

  @ApiProperty({ example: 125.5, minimum: 0.01, description: 'Per-night platform currency amount' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  pricePerNight!: number;
}

// Only room profile fields can be modified here; availability/blocking use separate operations.
export class UpdateRoomDto extends PartialType(CreateRoomDto) {}

export class SetRoomStatusDto {
  @ApiProperty({ description: 'true = bookable (subject to dates); false = disabled', example: false })
  @IsBoolean()
  active!: boolean;
}
