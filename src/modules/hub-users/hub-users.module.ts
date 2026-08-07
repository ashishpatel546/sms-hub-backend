import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubUser } from './entities/hub-user.entity';
import { HubUserRecoveryCode } from './entities/hub-user-recovery-code.entity';
import { HubRefreshToken } from '../auth/entities/hub-refresh-token.entity';
import { HubUsersService } from './hub-users.service';
import { HubUsersController } from './hub-users.controller';

@Module({
  imports: [
    // `HubRefreshToken` is registered here as well as in `AuthModule`:
    // deactivating, resetting or deleting a user has to revoke their
    // sessions, and taking the repository directly avoids importing
    // `AuthModule` — which already imports this one.
    TypeOrmModule.forFeature([HubUser, HubUserRecoveryCode, HubRefreshToken]),
  ],
  controllers: [HubUsersController],
  providers: [HubUsersService],
  exports: [HubUsersService, TypeOrmModule],
})
export class HubUsersModule {}
