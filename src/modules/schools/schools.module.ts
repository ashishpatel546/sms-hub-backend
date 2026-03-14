import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { School } from './entities/school.entity';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { GithubActionsService } from './github-actions.service';
import { HubUsersModule } from '../hub-users/hub-users.module';
import { ServiceTokensModule } from '../service-tokens/service-tokens.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([School]),
    HubUsersModule,
    ServiceTokensModule,
    S3Module,
  ],
  controllers: [SchoolsController],
  providers: [SchoolsService, TenantProvisioningService, GithubActionsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
