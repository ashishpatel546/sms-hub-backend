import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GlobalConfigModule } from './common/config/global-config.module';
import { AuthModule } from './modules/auth/auth.module';
import { HubUsersModule } from './modules/hub-users/hub-users.module';
import { S3Module } from './modules/s3/s3.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GlobalConfigModule,
    DatabaseModule,
    S3Module,
    AuthModule,
    HubUsersModule,
    SeederModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
