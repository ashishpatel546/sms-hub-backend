import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { HubUsersService } from '../hub-users/hub-users.service';
import { GlobalConfigService } from '../../common/config/global-config.service';
import { HubRefreshToken } from './entities/hub-refresh-token.entity';
import { HubUser } from '../hub-users/entities/hub-user.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface SessionMeta {
  deviceInfo?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly hubUsersService: HubUsersService,
    private readonly jwtService: JwtService,
    private readonly globalConfig: GlobalConfigService,
    @InjectRepository(HubRefreshToken)
    private readonly refreshTokenRepository: Repository<HubRefreshToken>,
  ) {}

  private accessTokenFor(user: HubUser): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  async login(email: string, password: string, meta: SessionMeta = {}) {
    const user = await this.hubUsersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isFirstLogin) {
      // No refresh token here on purpose: this stub only unlocks
      // /auth/change-password, and handing out a 30-day session for a
      // password the admin is about to replace would outlive its own reason.
      return {
        requirePasswordChange: true,
        access_token: this.jwtService.sign(
          {
            sub: user.id,
            email: user.email,
            role: user.role,
            isChangePasswordOnly: true,
          },
          { expiresIn: '15m' },
        ),
        role: user.role,
        email: user.email,
      };
    }

    // Cheap opportunistic sweep — the hub has no scheduler, and login is the
    // one moment we know we're already touching this user's session rows.
    await this.purgeExpiredSessions(user.id);

    return {
      requirePasswordChange: false,
      access_token: this.accessTokenFor(user),
      refresh_token: await this.createRefreshToken(user.id, meta),
      role: user.role,
      email: user.email,
    };
  }

  /**
   * Mints an opaque session handle. Not a JWT — it has to be revocable, and
   * revoking a JWT means keeping the same table anyway.
   */
  async createRefreshToken(
    hubUserId: number,
    meta: SessionMeta = {},
  ): Promise<string> {
    const token = crypto.randomBytes(40).toString('hex');
    const record = this.refreshTokenRepository.create({
      token,
      previousToken: null,
      previousTokenExpiresAt: null,
      hubUserId,
      deviceInfo: meta.deviceInfo ?? null,
      ipAddress: meta.ipAddress ?? null,
      lastActive: new Date(),
      expiresAt: this.refreshExpiryFromNow(),
    });
    await this.refreshTokenRepository.save(record);
    return token;
  }

  /** Reads `JWT_REFRESH_EXPIRES_IN` as `<n>m` / `<n>h` / `<n>d`; a bare number means days. */
  private refreshExpiryFromNow(): Date {
    const raw = this.globalConfig.env.JWT_REFRESH_EXPIRES_IN ?? '30d';
    const expiresAt = new Date();
    if (raw.endsWith('m')) {
      expiresAt.setMinutes(expiresAt.getMinutes() + (parseInt(raw, 10) || 30));
    } else if (raw.endsWith('h')) {
      expiresAt.setHours(expiresAt.getHours() + (parseInt(raw, 10) || 24));
    } else {
      expiresAt.setDate(expiresAt.getDate() + (parseInt(raw, 10) || 30));
    }
    return expiresAt;
  }

  /**
   * How long a just-rotated token keeps working. Long enough to cover a lost
   * response or two tabs refreshing together, short enough that a stolen
   * handle is worthless almost immediately.
   */
  private static readonly ROTATION_GRACE_MS = 60_000;

  /**
   * Trades a valid refresh token for a fresh access token, rotating the
   * refresh token in the same step so a leaked handle is effectively
   * single-use.
   */
  async refreshSession(refreshToken: string, meta: SessionMeta = {}) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const now = new Date();

    const record =
      (await this.refreshTokenRepository.findOne({
        where: { token: refreshToken },
        relations: { user: true },
      })) ??
      (await this.refreshTokenRepository.findOne({
        where: {
          previousToken: refreshToken,
          previousTokenExpiresAt: MoreThan(now),
        },
        relations: { user: true },
      }));

    if (!record || !record.user || now > record.expiresAt) {
      // Drop the dead row so it can't be probed again.
      if (record) await this.refreshTokenRepository.delete({ id: record.id });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // An admin mid-way through a forced password change has no real session.
    if (record.user.isFirstLogin) {
      await this.refreshTokenRepository.delete({ id: record.id });
      throw new UnauthorizedException('Password change required');
    }

    // Replay inside the grace window: hand back the token this row already
    // rotated to rather than rotating again, so the straggler converges on
    // the same handle every other tab is using.
    const isGraceReplay = record.token !== refreshToken;
    if (!isGraceReplay) {
      record.previousToken = record.token;
      record.previousTokenExpiresAt = new Date(
        now.getTime() + AuthService.ROTATION_GRACE_MS,
      );
      record.token = crypto.randomBytes(40).toString('hex');
    }

    record.lastActive = now;
    record.expiresAt = this.refreshExpiryFromNow();
    if (meta.ipAddress) record.ipAddress = meta.ipAddress;
    if (meta.deviceInfo) record.deviceInfo = meta.deviceInfo;
    await this.refreshTokenRepository.save(record);

    return {
      access_token: this.accessTokenFor(record.user),
      refresh_token: record.token,
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.refreshTokenRepository.delete({ token: refreshToken });
    }
    return { success: true };
  }

  async logoutAll(hubUserId: number) {
    await this.refreshTokenRepository.delete({ hubUserId });
    return { success: true };
  }

  async getSessions(hubUserId: number, currentRefreshToken?: string) {
    const sessions = await this.refreshTokenRepository.find({
      where: { hubUserId },
      order: { lastActive: 'DESC' },
    });
    const now = new Date();
    return sessions
      .filter((s) => s.expiresAt > now)
      .map((s) => ({
        id: s.id,
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        lastActive: s.lastActive,
        expiresAt: s.expiresAt,
        isCurrent: !!currentRefreshToken && s.token === currentRefreshToken,
      }))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  }

  private async purgeExpiredSessions(hubUserId: number): Promise<void> {
    await this.refreshTokenRepository.delete({
      hubUserId,
      expiresAt: LessThan(new Date()),
    });
  }

  async changePassword(userId: number, newPassword: string) {
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.hubUsersService.updatePassword(userId, newPasswordHash);
    // A new password invalidates every session minted under the old one.
    await this.logoutAll(userId);
    return { success: true };
  }
}
