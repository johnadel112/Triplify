import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, Matches, ValidateNested } from 'class-validator';

/** Check-in date inclusive; check-out date exclusive, matching hotel booking semantics. */
export class HotelNightRangeDto {
  @ApiProperty({ example: '2026-12-01', description: 'First bookable/blocked hotel-local night (inclusive)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ example: '2026-12-05', description: 'Date immediately after the last night (exclusive)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

/** Replaces ALL the existing ranges on the room. Empty array clears them. */
export class ReplaceRoomRangesDto {
  @ApiProperty({ type: [HotelNightRangeDto], example: [{ from: '2026-12-01', to: '2026-12-05' }] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => HotelNightRangeDto)
  ranges!: HotelNightRangeDto[];
}
