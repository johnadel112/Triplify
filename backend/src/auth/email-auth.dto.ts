import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class EmailRequestDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class EmailTokenDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class ResetPasswordDto extends EmailTokenDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]{8,72}$/)
  newPassword!: string;
}
export class EmailPreferenceDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
