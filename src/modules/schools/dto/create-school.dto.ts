import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSchoolDto {
  @ApiProperty({ example: 'DPS Noida' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'dps',
    description: 'Unique slug — becomes the subdomain and DB schema name. Lowercase letters, numbers, underscores only.',
  })
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and underscores',
  })
  slug: string;
}
