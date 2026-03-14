import { Module } from '@nestjs/common';
import { SeederService } from './seeder.service';
import { HubUsersModule } from '../hub-users/hub-users.module';

@Module({
  imports: [HubUsersModule],
  providers: [SeederService],
})
export class SeederModule {}
