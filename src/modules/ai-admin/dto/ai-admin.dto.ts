import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrantCreditsDto {
  @ApiProperty({ description: 'Number of credits to add', minimum: 1 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional admin note' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  display_name: string;

  @ApiProperty({ enum: ['individual', 'school', 'topup'] })
  @IsString()
  plan_type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  monthly_credits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  price_inr?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  allowed_roles?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  features?: Record<string, boolean>;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  monthly_credits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  price_inr?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  features?: Record<string, boolean>;

  @ApiPropertyOptional()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateSettingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ default: 'string' })
  @IsOptional()
  @IsString()
  value_type?: string;
}

export class GrantPlanDto {
  @ApiProperty({ description: 'UUID of the plan to grant' })
  @IsString()
  @IsNotEmpty()
  plan_id: string;

  @ApiProperty({
    description: 'Date until which the plan is valid (YYYY-MM-DD)',
  })
  @IsString()
  @IsNotEmpty()
  valid_until: string;

  @ApiPropertyOptional({ description: 'Optional admin note' })
  @IsOptional()
  @IsString()
  note?: string;
}
