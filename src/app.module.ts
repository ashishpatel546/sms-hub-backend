import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './common/config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { HubUsersModule } from './modules/hub-users/hub-users.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { ServiceTokensModule } from './modules/service-tokens/service-tokens.module';
import { S3Module } from './modules/s3/s3.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: '.env',
    }),
    DatabaseModule,
    S3Module,
    AuthModule,
    HubUsersModule,
    SchoolsModule,
    ServiceTokensModule,
    SeederModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
