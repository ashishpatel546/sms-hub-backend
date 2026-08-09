import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HubRefreshToken } from './entities/hub-refresh-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { HubAccessGuard } from './hub-access.guard';
import { TotpService } from './totp.service';
import { HubUsersModule } from '../hub-users/hub-users.module';
import { assertHubCapabilitiesValid } from './hub-capabilities';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_SECRET',
          'default_jwt_secret_change_me',
        ),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '8h') as any,
        },
      }),
      inject: [ConfigService],
    }),
    HubUsersModule,
    TypeOrmModule.forFeature([HubRefreshToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TotpService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    HubAccessGuard,
  ],
  exports: [
    AuthService,
    TotpService,
    JwtModule,
    JwtAuthGuard,
    RolesGuard,
    HubAccessGuard,
  ],
})
export class AuthModule implements OnModuleInit {
  /**
   * Anti-drift check for `HUB_CAPABILITIES`, run once at boot. Cheap (a dozen
   * string comparisons) and non-fatal — it logs and moves on, because a
   * malformed capability row costs one greyed-out console button, not a
   * working platform.
   */
  onModuleInit(): void {
    assertHubCapabilitiesValid();
  }
}
