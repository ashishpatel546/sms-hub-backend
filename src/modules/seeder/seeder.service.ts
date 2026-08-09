import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HubUsersService } from '../hub-users/hub-users.service';
import {
  HubAccessLevel,
  HubUserRole,
} from '../hub-users/entities/hub-user.entity';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly hubUsersService: HubUsersService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedSystemAdmin();
  }

  private async seedSystemAdmin() {
    const email = this.configService.get<string>('HUB_SYSTEM_ADMIN_EMAIL');
    const password = this.configService.get<string>(
      'HUB_SYSTEM_ADMIN_PASSWORD',
    );

    if (!email || !password) {
      this.logger.error(
        'HUB_SYSTEM_ADMIN_EMAIL or HUB_SYSTEM_ADMIN_PASSWORD not set in .env',
      );
      return;
    }

    const existing = await this.hubUsersService.findByEmail(email);
    if (existing) {
      return;
    }

    await this.hubUsersService.create({
      email,
      password,
      role: HubUserRole.SYSTEM_ADMIN,
      // Explicit: the column defaults to VIEW (least privilege for invited
      // users), but the bootstrap admin is the one account that has to be
      // able to invite everybody else.
      accessLevel: HubAccessLevel.ADMIN,
    });

    this.logger.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
    this.logger.log(`SYSTEM_ADMIN seeded: ${email}`);
    this.logger.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
  }
}
