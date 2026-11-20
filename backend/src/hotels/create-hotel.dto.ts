import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateHotelDto {
  @ApiProperty({ example: 'Grand Nile Hotel' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'A luxury hotel overlooking the Nile River.' })
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  description!: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'Egypt' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @ApiProperty({ example: '15 Nile Street, Cairo' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  address!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  starClass!: number;

  @ApiPropertyOptional({ type: [String], example: ['Wi-Fi', 'Swimming Pool', 'Parking'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  amenities?: string[];

  @ApiPropertyOptional({ type: [String], example: ['https://example.com/hotel.jpg'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  images?: string[];

  @ApiProperty({ example: 'Africa/Cairo' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  timeZone!: string;
}

export class UpdateHotelDto extends PartialType(CreateHotelDto) {}
