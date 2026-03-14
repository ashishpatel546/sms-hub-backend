import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubUser } from './entities/hub-user.entity';
import { HubUsersService } from './hub-users.service';

@Module({
  imports: [TypeOrmModule.forFeature([HubUser])],
  providers: [HubUsersService],
  exports: [HubUsersService, TypeOrmModule],
})
export class HubUsersModule {}
