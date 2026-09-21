import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'newPassword123!',
    description: 'The new password to set',
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiPropertyOptional({
    description:
      'The password being replaced. Required for a normal signed-in session; ' +
      'ignored on the change-password-only token issued at first sign-in or ' +
      'after an admin reset, which has just proved it.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;
}
