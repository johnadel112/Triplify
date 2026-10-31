import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus, UserRole } from './domain';
const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const Email = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
export class CredentialsDto {
  @ApiProperty({ example: 'traveler@example.com' })
  @Email()
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ format: 'password', maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
export class RegisterDto extends CredentialsDto {
  @ApiProperty() @Trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty({ minLength: 8, format: 'password' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]{8,72}$/, {
    message: 'Password must be 8–72 printable ASCII characters with a letter and digit',
  })
  declare password: string;
  @ApiProperty({ enum: [true] }) @Equals(true) @IsBoolean() consent!: boolean;
}
export class PasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;
  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]{8,72}$/)
  newPassword!: string;
}
export class ProfileDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{5,30}$/)
  phoneNumber?: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  preferredCurrency?: string;
}
export class ConfirmationDto {
  @ApiProperty({ enum: [true] }) @Equals(true) confirmation!: boolean;
}
export class ModeratorDto extends CredentialsDto {
  @ApiProperty() @Trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty({ enum: [UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR] })
  @IsIn([UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])
  role!: UserRole;
  @ApiProperty() @IsMongoId() providerId!: string;
  @ApiProperty({ format: 'password' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]{8,72}$/)
  declare password: string;
}
export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
}
export class AccountFilters extends PageDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: UserRole }) @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
}
export class BookingFilters extends PageDto {
  @ApiPropertyOptional({ enum: ['FLIGHT', 'HOTEL'] })
  @IsOptional()
  @IsIn(['FLIGHT', 'HOTEL'])
  type?: 'FLIGHT' | 'HOTEL';
  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])
  status?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/)
  startDate?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/)
  endDate?: string;
}
export class ReferenceQuery extends PageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(100) search?: string;
}
