import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'AI model tier (1=Basic, 2=Standard, 3=Advanced)',
  })
  @IsOptional()
  @IsInt()
  model_tier?: number;
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

  @ApiPropertyOptional({
    description: 'AI model tier (1=Basic, 2=Standard, 3=Advanced)',
  })
  @IsOptional()
  @IsInt()
  model_tier?: number;
}

export class UpdateLlmTiersDto {
  @ApiProperty({
    description:
      'Map of tier number → { provider, model, label?, description? }',
    example: {
      '1': {
        provider: 'gemini',
        model: 'gemini-2.0-flash-lite',
        label: 'Basic',
        description: 'Cheapest model',
      },
    },
  })
  @IsObject()
  tiers: Record<
    string,
    { provider: string; model: string; label?: string; description?: string }
  >;
}

export class CreateLlmTierDto {
  @ApiProperty({
    description: 'Display label for the new tier',
    example: 'Premium',
  })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ description: 'Short description shown to admins' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['gemini', 'openai', 'anthropic'] })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({
    description: 'Model id for this tier',
    example: 'gemini-2.5-pro',
  })
  @IsString()
  @IsNotEmpty()
  model: string;
}

export class UpdateAllowedModelsDto {
  @ApiProperty({ enum: ['gemini', 'openai', 'anthropic'] })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({
    type: [String],
    description: 'Allowed model ids for this provider',
  })
  @IsArray()
  @IsString({ each: true })
  models: string[];
}

export class UpdateLlmPricingDto {
  @ApiProperty({
    description:
      'Map of model id → { input, output } in USD per million tokens',
    example: { 'gemini-2.5-flash': { input: 0.3, output: 2.5 } },
  })
  @IsObject()
  pricing: Record<string, { input: number; output: number }>;

  @ApiPropertyOptional({ description: 'USD → INR conversion rate' })
  @IsOptional()
  @IsNumber()
  usd_to_inr_rate?: number;

  @ApiPropertyOptional({ description: 'Tokens consumed per credit' })
  @IsOptional()
  @IsInt()
  @Min(1)
  tokens_per_credit?: number;
}

export class UpdateFeatureRolesDto {
  @ApiProperty({
    description: 'Map of feature key → allowed AI roles (student/teacher)',
    example: { explain_topic: ['student', 'teacher'] },
  })
  @IsObject()
  feature_roles: Record<string, string[]>;
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
