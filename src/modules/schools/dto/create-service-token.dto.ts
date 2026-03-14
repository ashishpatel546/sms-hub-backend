import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateServiceTokenDto {
  @ApiProperty({ example: 'GitHub Actions — DPS' })
  @IsString()
  @MinLength(3)
  label: string;
}
