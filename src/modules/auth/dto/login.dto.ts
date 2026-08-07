import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
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

  /**
   * Second factor. Optional on the wire because the client cannot know
   * whether this account is enrolled until it has tried: a first call
   * without it answers `{ requireTotp: true }` and issues no tokens.
   */
  @ApiPropertyOptional({
    example: '123456',
    description: 'TOTP code — required when the account has TOTP enabled',
  })
  @IsOptional()
  @IsString()
  totpCode?: string;
}
