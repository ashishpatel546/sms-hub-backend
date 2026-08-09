import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnableTotpDto {
  @ApiProperty({
    example: '123456',
    description: 'Code from the authenticator app that just scanned the QR',
  })
  @IsString()
  @Length(6, 6)
  code: string;
}

/**
 * Re-issuing recovery codes needs proof the authenticator is still in hand,
 * not just a live session — the new codes are themselves a standing bypass of
 * the second factor.
 */
export class RegenerateRecoveryCodesDto {
  @ApiProperty({
    example: '123456',
    description: 'A current code from the enrolled authenticator app',
  })
  @IsString()
  @Length(6, 6)
  code: string;
}

/**
 * Recovery is a *second* factor, so it carries the first one with it —
 * the credentials the login form already holds. Without them this endpoint
 * would turn a stolen recovery code into a password-free login.
 */
export class TotpRecoveryDto {
  @ApiProperty({
    example: 'admin@colegios.in',
    description: 'Email or mobile number on file for the hub account',
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    description: 'One of the recovery codes issued at enrolment',
  })
  @IsString()
  code: string;
}
