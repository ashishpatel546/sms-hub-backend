import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvDto } from '../dto/env.dto';

@Injectable()
export class GlobalConfigService {
  private envConfig: EnvDto;

  constructor() {
    const config = plainToInstance(EnvDto, process.env, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(config, {
      skipMissingProperties: false,
    });
    if (errors.length > 0) {
      throw new Error(errors.toString());
    }
    this.envConfig = config;
  }

  get env(): EnvDto {
    return this.envConfig;
  }
}
