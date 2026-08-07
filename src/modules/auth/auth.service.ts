import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { HubUsersService } from '../hub-users/hub-users.service';
import { GlobalConfigService } from '../../common/config/global-config.service';
import { TotpService } from './totp.service';
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
    private readonly totpService: TotpService,
    @InjectRepository(HubRefreshToken)
    private readonly refreshTokenRepository: Repository<HubRefreshToken>,
  ) {}

  private accessTokenFor(user: HubUser): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      // Hub-local privilege — see `HubAccessGuard`. Kept separate from
      // `role`, which is the cross-service contract `sms-backend` reads.
      access: user.accessLevel,
      // Says which console minted this. `sms-backend` accepts the same
      // signature, so the origin is worth stating rather than inferring.
      scope: 'platform',
    });
  }

  /**
   * The login state machine, in the order the factors actually matter:
   *
   *   1. password (and account status)
   *   2. TOTP, whenever the account is enrolled
   *   3. forced password change, if the admin reset this account
   *   4. TOTP enrolment, if the account has never set it up
   *   5. full session
   *
   * The second factor deliberately sits ABOVE the first-login branch. An
   * admin password reset sets `isFirstLogin`, and the bootstrap password is
   * a deployment-wide constant — checking TOTP after that branch would let
   * anyone who knows the constant walk past the second factor and set a
   * password of their own choosing.
   */
  async login(
    identifier: string,
    password: string,
    meta: SessionMeta = {},
    totpCode?: string,
  ) {
    const user = await this.hubUsersService.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    if (user.totpEnabledAt) {
      if (!totpCode) {
        // No tokens, and nothing else either — the answer to "does this
        // account have 2FA on" is already implied by reaching this branch,
        // but nothing further should leak before the second factor lands.
        return { requireTotp: true };
      }
      await this.totpService.verifyCode(user, totpCode);
    }

    if (user.isFirstLogin) {
      return this.changePasswordStub(user);
    }

    if (!user.totpEnabledAt) {
      // TOTP is mandatory, so an un-enrolled account gets a token that can do
      // exactly one thing: enrol. Previously this was a full session plus a
      // `requireTotpSetup` flag, which made the mandate a frontend courtesy —
      // anyone calling the API directly simply ignored it. `JwtAuthGuard`
      // now enforces the restriction server-side, the same way it already
      // does for the change-password stub.
      //
      // No refresh token, for the same reason as the stub above: the session
      // exists only until enrolment completes, and the user re-logs in with
      // both factors afterwards.
      return {
        requireTotpSetup: true,
        access_token: this.jwtService.sign(
          {
            sub: user.id,
            email: user.email,
            role: user.role,
            access: user.accessLevel,
            scope: 'platform',
            isTotpSetupOnly: true,
          },
          { expiresIn: '15m' },
        ),
        role: user.role,
        accessLevel: user.accessLevel,
        email: user.email,
      };
    }

    return this.issueSession(user, meta);
  }

  /**
   * Second-factor login by recovery code, for the phone that was lost or
   * wiped. Carries the password too: a recovery code is a *second* factor,
   * and accepting it alone would turn a printout into a password-free login.
   */
  /**
   * The forced-password-change response.
   *
   * No refresh token on purpose: this stub only unlocks
   * /auth/change-password, and handing out a 30-day session for a password
   * the admin is about to replace would outlive its own reason.
   *
   * Shared by both entry points. A recovery code is an alternative *second
   * factor*, not a way around the first-login rule — without this, an account
   * whose password had just been reset could take a full session with the
   * bootstrap password and simply never change it.
   */
  private changePasswordStub(user: HubUser) {
    return {
      requirePasswordChange: true,
      access_token: this.jwtService.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          access: user.accessLevel,
          scope: 'platform',
          isChangePasswordOnly: true,
        },
        { expiresIn: '15m' },
      ),
      role: user.role,
      email: user.email,
    };
  }

  async loginWithRecoveryCode(
    identifier: string,
    password: string,
    code: string,
    meta: SessionMeta = {},
  ) {
    const user = await this.hubUsersService.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    if (!user.totpEnabledAt) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled for this account',
      );
    }

    await this.totpService.consumeRecoveryCode(user.id, code);

    // The code is spent either way — it proved the second factor, which is all
    // it is for. A pending forced password change still stands.
    if (user.isFirstLogin) {
      return {
        ...this.changePasswordStub(user),
        recoveryCodesRemaining: await this.totpService.countUnusedRecoveryCodes(
          user.id,
        ),
      };
    }

    return {
      ...(await this.issueSession(user, meta)),
      recoveryCodesRemaining: await this.totpService.countUnusedRecoveryCodes(
        user.id,
      ),
    };
  }

  /** The tail end of every successful login, once both factors are settled. */
  private async issueSession(user: HubUser, meta: SessionMeta) {
    // Cheap opportunistic sweep — the hub has no scheduler, and login is the
    // one moment we know we're already touching this user's session rows.
    await this.purgeExpiredSessions(user.id);
    await this.hubUsersService.markLoggedIn(user.id);

    return {
      requirePasswordChange: false,
      access_token: this.accessTokenFor(user),
      refresh_token: await this.createRefreshToken(user.id, meta),
      role: user.role,
      accessLevel: user.accessLevel,
      email: user.email,
      // Always false by construction: every path into this method has already
      // established a second factor. Kept in the payload because the console
      // reads it, and a field that silently disappears is worse than one that
      // is honestly constant.
      requireTotpSetup: false,
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

    // Same reasoning as the first-login check: an account with no second
    // factor has no real session either. This also closes the door behind an
    // admin TOTP reset — any refresh handle minted before the reset stops
    // being redeemable the moment enrolment is cleared.
    if (!record.user.totpEnabledAt) {
      await this.refreshTokenRepository.delete({ id: record.id });
      throw new UnauthorizedException(
        'Two-factor authentication setup required',
      );
    }

    // Deactivation revokes sessions, but a handle presented in the same
    // instant would otherwise slip through and mint a fresh 8h token.
    if (!record.user.isActive) {
      await this.refreshTokenRepository.delete({ id: record.id });
      throw new UnauthorizedException('This account has been deactivated');
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
