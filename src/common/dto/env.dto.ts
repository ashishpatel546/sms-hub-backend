import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvDto {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  PORT: number = 3002;

  @IsString()
  DB_HOST: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  DB_SYNCHRONIZE: boolean = false;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  DB_LOGGING: boolean = false;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  SWAGGER_ENABLED: boolean = true;

  @IsString()
  JWT_SECRET: string = 'default_jwt_secret_change_me';

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '8h';

  /**
   * Lifetime of the `hub_refresh_token` row, not of a JWT. Kept long so the
   * console survives overnight; the access token above stays short because
   * `sms-backend` honours it on every `/admin/*` route.
   */
  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  @IsString()
  @IsOptional()
  WHITELIST_TRUSTED_URLS: string = '*';

  @IsString()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsOptional()
  AWS_REGION: string = 'ap-south-1';

  @IsString()
  AWS_S3_BUCKET: string;

  @IsString()
  @IsOptional()
  HUB_SYSTEM_ADMIN_EMAIL: string;

  @IsString()
  @IsOptional()
  HUB_SYSTEM_ADMIN_PASSWORD: string;

  /** URL of the school-ai FastAPI service (e.g. http://localhost:8001) */
  @IsString()
  @IsOptional()
  AI_BACKEND_URL: string = 'http://localhost:8001';

  /** Shared secret matching school-ai's INTERNAL_API_KEY env var */
  @IsString()
  @IsOptional()
  AI_INTERNAL_KEY: string = '';
}
