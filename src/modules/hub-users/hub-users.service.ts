import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import {
  HubAccessLevel,
  HubUser,
  HubUserRole,
} from './entities/hub-user.entity';
import { HubUserRecoveryCode } from './entities/hub-user-recovery-code.entity';
import { HubRefreshToken } from '../auth/entities/hub-refresh-token.entity';
import { GlobalConfigService } from '../../common/config/global-config.service';
import { generateTemporaryPassword } from '../../common/utils/password.util';
import { normalizeMobile } from '../../common/utils/mobile.util';
import type { PasswordMode } from './dto/hub-user.dto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

/** A hub user with every secret-bearing field removed. */
export type PublicHubUser = Omit<
  HubUser,
  'passwordHash' | 'totpSecret' | 'totpLastStep'
> & { totpEnabled: boolean };

@Injectable()
export class HubUsersService {
  constructor(
    @InjectRepository(HubUser)
    private readonly hubUsersRepository: Repository<HubUser>,
    // The refresh-token repository rather than `AuthService`: every
    // destructive change here has to revoke sessions, and `AuthModule`
    // already imports this module — injecting the service back would close
    // the loop.
    @InjectRepository(HubRefreshToken)
    private readonly refreshTokenRepository: Repository<HubRefreshToken>,
    // Clearing a user's second factor has to take their recovery codes with
    // it — codes issued against the old secret would otherwise survive as a
    // way back into an account the admin just locked out.
    @InjectRepository(HubUserRecoveryCode)
    private readonly recoveryCodeRepository: Repository<HubUserRecoveryCode>,
    private readonly globalConfig: GlobalConfigService,
  ) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<HubUser | null> {
    return this.hubUsersRepository.findOne({ where: { email } });
  }

  /**
   * Login lookup: matches email OR mobile, whichever the identifier looks
   * like. `normalizeMobile` is a no-op on an email-shaped string (it only
   * strips formatting from something that ends up 10 digits), so trying both
   * columns for any input is safe — an email never accidentally matches a
   * `mobile` column, which only ever holds normalised 10-digit values.
   */
  async findByIdentifier(identifier: string): Promise<HubUser | null> {
    const value = (identifier ?? '').trim();
    if (!value) return null;

    const email = value.toLowerCase();
    const mobile = normalizeMobile(value) as string;
    return this.hubUsersRepository.findOne({
      where: [{ email }, { mobile }],
    });
  }

  async findById(id: number): Promise<HubUser> {
    const user = await this.hubUsersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Hub user ${id} not found`);
    }
    return user;
  }

  async list(): Promise<PublicHubUser[]> {
    const users = await this.hubUsersRepository.find({
      order: { createdAt: 'ASC' },
    });
    return users.map((user) => HubUsersService.toPublic(user));
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /**
   * Also used by the seeder, which passes an explicit password. Console
   * invites go through {@link invite} instead.
   */
  async create(data: {
    email: string;
    password: string;
    role: HubUserRole;
    name?: string | null;
    mobile?: string | null;
    accessLevel?: HubAccessLevel;
    createdById?: number | null;
  }): Promise<HubUser> {
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = this.hubUsersRepository.create({
      email: data.email,
      passwordHash,
      role: data.role,
      name: data.name ?? null,
      mobile: data.mobile ?? null,
      accessLevel: data.accessLevel ?? HubAccessLevel.VIEW,
      createdById: data.createdById ?? null,
      isFirstLogin: true,
    });
    return this.hubUsersRepository.save(user);
  }

  /**
   * Creates a console user, either on the deployment-wide bootstrap password
   * or on a random one returned exactly once.
   *
   * `isFirstLogin` forces a change at first sign-in either way. The mode
   * matters for the window before that happens: the default password is the
   * same value for every account, so until the invited person signs in,
   * anyone who knows it can sign in as them — and because two-factor is
   * enrolled on first use, they could enrol their own authenticator. A
   * temporary password has no shared value to guess, which is why it is the
   * default here.
   */
  async invite(
    data: {
      email: string;
      name?: string;
      mobile?: string | null;
      accessLevel?: HubAccessLevel;
      passwordMode?: PasswordMode;
    },
    actorId: number,
  ): Promise<
    PublicHubUser & { passwordMode: PasswordMode; password?: string }
  > {
    const email = data.email.trim().toLowerCase();
    if (await this.findByEmail(email)) {
      throw new ConflictException(
        `A hub user with email ${email} already exists`,
      );
    }

    const mobile = data.mobile ?? null;
    if (
      mobile &&
      (await this.hubUsersRepository.findOne({ where: { mobile } }))
    ) {
      throw new ConflictException(
        `A hub user with mobile ${mobile} already exists`,
      );
    }

    const passwordMode: PasswordMode = data.passwordMode ?? 'temporary';
    const plaintext =
      passwordMode === 'temporary'
        ? generateTemporaryPassword()
        : this.defaultPassword();

    const created = await this.create({
      email,
      password: plaintext,
      role: HubUserRole.SYSTEM_ADMIN,
      name: data.name?.trim() || null,
      mobile,
      accessLevel: data.accessLevel ?? HubAccessLevel.VIEW,
      createdById: actorId,
    });

    return {
      ...HubUsersService.toPublic(created),
      passwordMode,
      // Returned for BOTH modes. Echoing the default looks redundant — the
      // inviting admin "already knows" it — but that assumption is what made
      // the console hard-code the value in its own copy, which goes stale the
      // moment HUB_DEFAULT_PASSWORD differs in an environment. The server is
      // the only thing that knows what was actually set. Never stored in
      // plaintext, and shown once.
      password: plaintext,
    };
  }

  async updateProfile(
    id: number,
    data: { name?: string; email?: string; mobile?: string | null },
  ): Promise<PublicHubUser> {
    const user = await this.findById(id);

    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      const clash = await this.hubUsersRepository.findOne({
        where: { email, id: Not(id) },
      });
      if (clash) {
        throw new ConflictException(
          `A hub user with email ${email} already exists`,
        );
      }
      user.email = email;
    }

    if (data.mobile !== undefined) {
      const mobile = data.mobile ?? null;
      if (mobile) {
        const clash = await this.hubUsersRepository.findOne({
          where: { mobile, id: Not(id) },
        });
        if (clash) {
          throw new ConflictException(
            `A hub user with mobile ${mobile} already exists`,
          );
        }
      }
      user.mobile = mobile;
    }

    if (data.name !== undefined) {
      user.name = data.name.trim() || null;
    }

    return HubUsersService.toPublic(await this.hubUsersRepository.save(user));
  }

  async setAccessLevel(
    id: number,
    accessLevel: HubAccessLevel,
    actorId: number,
  ): Promise<PublicHubUser> {
    // Self-demotion is the fastest way to a console nobody can administer,
    // and the fix would need the very privilege just given up.
    if (id === actorId) {
      throw new ForbiddenException('You cannot change your own access level');
    }

    const user = await this.findById(id);
    if (accessLevel !== HubAccessLevel.ADMIN) {
      await this.assertNotLastActiveAdmin(user, 'demote');
    }

    user.accessLevel = accessLevel;
    return HubUsersService.toPublic(await this.hubUsersRepository.save(user));
  }

  async toggleStatus(id: number, actorId: number): Promise<PublicHubUser> {
    if (id === actorId) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const user = await this.findById(id);
    if (user.isActive) {
      await this.assertNotLastActiveAdmin(user, 'deactivate');
    }

    user.isActive = !user.isActive;
    const saved = await this.hubUsersRepository.save(user);

    // A deactivated user must stop being able to act *now*, not whenever
    // their access token happens to expire.
    if (!saved.isActive) {
      await this.revokeSessions(id);
    }

    return HubUsersService.toPublic(saved);
  }

  /**
   * Resets a console password to either the shared default or a fresh random
   * one, mirroring `POST /admin/users/:id/reset-password` in sms-backend so
   * both resets behave the same way for whoever is doing them.
   *
   * The plaintext of a temporary password is returned once and never stored,
   * logged, or retrievable again — losing it means resetting again.
   */
  async resetPassword(
    id: number,
    mode: PasswordMode = 'default',
  ): Promise<{
    success: true;
    message: string;
    mode: PasswordMode;
    /** What was actually set, in either mode — see {@link invite}. */
    password: string;
    /** @deprecated Use `password`. Kept so existing callers keep working. */
    temporaryPassword?: string;
  }> {
    const user = await this.findById(id);

    const plaintext =
      mode === 'temporary'
        ? generateTemporaryPassword()
        : this.defaultPassword();

    user.passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
    user.isFirstLogin = true;
    await this.hubUsersRepository.save(user);

    // Whoever is holding a session on the old password loses it.
    await this.revokeSessions(id);

    return {
      success: true,
      message:
        mode === 'temporary'
          ? 'Password reset. Share the temporary password securely — it is shown only once.'
          : 'Password reset to the default. The user must change it at next login.',
      mode,
      password: plaintext,
      ...(mode === 'temporary' ? { temporaryPassword: plaintext } : {}),
    };
  }

  /**
   * Clears a user's second factor entirely: secret, enrolment, replay
   * watermark and every recovery code. The next login lands on the
   * setup-only session and re-enrols from scratch.
   *
   * Deliberately independent of {@link resetPassword}. Losing a phone and
   * forgetting a password are different accidents, and folding them together
   * would mean every password reset silently stripped a working second
   * factor — the exact weakening this endpoint exists to avoid needing.
   *
   * No self-guard: an admin who has lost their own phone and their own
   * printout is precisely the person who needs this, and the last-admin rule
   * doesn't apply because nobody loses ADMIN here.
   */
  async resetTotp(id: number): Promise<{ success: true; totpEnabled: false }> {
    const user = await this.findById(id);

    // A half-finished enrolment (secret, no `totpEnabledAt`) counts: it is
    // still state the user has to be able to walk away from.
    const hadTotpState = !!user.totpEnabledAt || !!user.totpSecret;

    await this.hubUsersRepository.update(id, {
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
    });
    await this.recoveryCodeRepository.delete({ hubUserId: id });

    // Idempotent by design — resetting a user who was never enrolled is a
    // successful no-op, and there is no reason to knock out sessions that
    // were never resting on a second factor in the first place.
    if (hadTotpState) {
      await this.revokeSessions(id);
    }

    return { success: true, totpEnabled: false };
  }

  async remove(id: number, actorId: number): Promise<{ success: true }> {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.findById(id);
    await this.assertNotLastActiveAdmin(user, 'delete');

    // Ahead of the delete rather than relying on the FK cascade: the cascade
    // would do it, but session revocation is the point of the operation and
    // shouldn't be a side effect of schema config.
    await this.revokeSessions(id);
    await this.hubUsersRepository.delete({ id });

    return { success: true };
  }

  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.hubUsersRepository.update(userId, {
      passwordHash: newPasswordHash,
      isFirstLogin: false,
    });
  }

  async markLoggedIn(userId: number): Promise<void> {
    await this.hubUsersRepository.update(userId, { lastLoginAt: new Date() });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * The console must always have somebody who can administer it. Every path
   * that could remove the last such account funnels through here.
   */
  private async assertNotLastActiveAdmin(
    user: HubUser,
    action: 'demote' | 'deactivate' | 'delete',
  ): Promise<void> {
    if (user.accessLevel !== HubAccessLevel.ADMIN || !user.isActive) {
      return;
    }

    const otherActiveAdmins = await this.hubUsersRepository.count({
      where: {
        accessLevel: HubAccessLevel.ADMIN,
        isActive: true,
        id: Not(user.id),
      },
    });

    if (otherActiveAdmins === 0) {
      throw new BadRequestException(
        `Cannot ${action} the last active ADMIN — promote another user to ADMIN first`,
      );
    }
  }

  private async revokeSessions(hubUserId: number): Promise<void> {
    await this.refreshTokenRepository.delete({ hubUserId });
  }

  private defaultPassword(): string {
    return this.globalConfig.env.HUB_DEFAULT_PASSWORD;
  }

  /**
   * The single place a `HubUser` is shaped for a response. Password hash and
   * TOTP secret are dropped outright; enrolment is reported as a boolean so
   * the console can show status without ever seeing the secret.
   */
  static toPublic(user: HubUser): PublicHubUser {
    const {
      passwordHash: _passwordHash,
      totpSecret: _totpSecret,
      totpLastStep: _totpLastStep,
      ...rest
    } = user;
    return { ...rest, totpEnabled: !!user.totpEnabledAt };
  }
}
