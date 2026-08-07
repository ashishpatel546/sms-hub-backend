import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HubAccessLevel } from '../entities/hub-user.entity';
import {
  INDIAN_MOBILE_REGEX,
  normalizeMobile,
} from '../../../common/utils/mobile.util';

/**
 * `''` and `null` both mean "no mobile on file". Everything else is
 * normalised to a bare 10-digit number, because `HubUsersService.findByIdentifier`
 * matches `mobile` with an exact string comparison — a number stored as
 * "+91 98765 43210" would simply never resolve at login.
 */
const toMobile = ({ value }: { value: unknown }): unknown =>
  value === null || value === '' ? null : normalizeMobile(value);

/**
 * How an initial or reset password is chosen.
 *
 * `'default'`   → the deployment-wide `HUB_DEFAULT_PASSWORD`. Convenient, and
 *                 the same value for everyone — so anyone who knows it can
 *                 sign in as a user who has not yet changed theirs.
 * `'temporary'` → a random one-time password, returned in the response once
 *                 and never retrievable again.
 *
 * Same vocabulary as `AdminResetPasswordDto` in sms-backend, so the school
 * and hub reset flows behave identically.
 */
export type PasswordMode = 'default' | 'temporary';

export const PASSWORD_MODES: PasswordMode[] = ['default', 'temporary'];

export class CreateHubUserDto {
  @ApiProperty({ example: 'ops@colegios.in' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Ops Team' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '9876543210', nullable: true })
  @Transform(toMobile)
  @Matches(INDIAN_MOBILE_REGEX, {
    message: 'mobile must be a valid 10-digit Indian mobile number',
  })
  @IsOptional()
  mobile?: string | null;

  /**
   * Defaults to VIEW rather than being required: least privilege should be
   * what you get when the field is left off the form.
   */
  @ApiPropertyOptional({
    enum: HubAccessLevel,
    default: HubAccessLevel.VIEW,
  })
  @IsOptional()
  @IsEnum(HubAccessLevel)
  accessLevel?: HubAccessLevel;

  /**
   * Defaults to `'temporary'`: a per-user random password has no shared value
   * to guess, which matters most in exactly this window — a brand-new account
   * that has not yet been signed into.
   */
  @ApiPropertyOptional({ enum: PASSWORD_MODES, default: 'temporary' })
  @IsOptional()
  @IsIn(PASSWORD_MODES)
  passwordMode?: PasswordMode;
}

/** Body for POST /hub-users/:id/reset-password. */
export class ResetHubUserPasswordDto {
  @ApiProperty({ enum: PASSWORD_MODES })
  @IsIn(PASSWORD_MODES)
  mode: PasswordMode;
}

export class UpdateHubUserDto {
  @ApiPropertyOptional({ example: 'Ops Team' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'ops@colegios.in' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '9876543210', nullable: true })
  @Transform(toMobile)
  @Matches(INDIAN_MOBILE_REGEX, {
    message: 'mobile must be a valid 10-digit Indian mobile number',
  })
  @IsOptional()
  mobile?: string | null;
}

export class UpdateAccessLevelDto {
  @ApiProperty({ enum: HubAccessLevel })
  @IsEnum(HubAccessLevel)
  accessLevel: HubAccessLevel;
}
