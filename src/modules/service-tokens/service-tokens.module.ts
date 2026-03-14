import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceToken } from './entities/service-token.entity';
import { ServiceTokensService } from './service-tokens.service';
import { ServiceTokenGuard } from './service-token.guard';
import { School } from '../schools/entities/school.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceToken, School])],
  providers: [ServiceTokensService, ServiceTokenGuard],
  exports: [ServiceTokensService, ServiceTokenGuard, TypeOrmModule],
})
export class ServiceTokensModule {}
