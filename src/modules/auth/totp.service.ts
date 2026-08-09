import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { HubUser } from '../hub-users/entities/hub-user.entity';
import { HubUserRecoveryCode } from '../hub-users/entities/hub-user-recovery-code.entity';

/** Shown as the account issuer in the authenticator app. */
const TOTP_ISSUER = 'Colegios Hub';

/** RFC 6238 time step, in seconds. The universal default; do not change. */
const TOTP_PERIOD = 30;

/**
 * Clock-skew allowance, expressed the way otplib wants it (seconds, not
 * steps). One period either side — enough for a phone whose clock has
 * drifted, small enough that a shoulder-surfed code is stale almost at once.
 */
const TOTP_EPOCH_TOLERANCE = TOTP_PERIOD;

const RECOVERY_CODE_COUNT = 10;
const BCRYPT_ROUNDS = 10;

/**
 * otplib's `verify` returns a TOTP-or-HOTP union; only the TOTP arm carries
 * `timeStep`, and narrowing a union by strategy isn't expressible here.
 */
type TotpVerifyResult =
  | { valid: true; delta: number; epoch: number; timeStep: number }
  | { valid: false };

@Injectable()
export class TotpService {
  constructor(
    @InjectRepository(HubUser)
    private readonly hubUserRepository: Repository<HubUser>,
    @InjectRepository(HubUserRecoveryCode)
    private readonly recoveryCodeRepository: Repository<HubUserRecoveryCode>,
  ) {}

  /**
   * Mints a secret and renders it for scanning.
   *
   * `totpEnabledAt` stays null: a rendered QR is not an enrolment, and
   * gating login on the secret alone would lock out anyone who opened this
   * screen and closed it. `/auth/totp/enable` is what completes the pairing.
   */
  async setup(userId: number, rotate = false) {
    const user = await this.hubUserRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled for this account',
      );
    }

    // Reuse a pending secret rather than minting a new one on every call.
    //
    // The enrolment screen calls this on load, and enrolment is a two-device
    // dance: scan here, type the code there. Rotating on each call means a
    // page refresh — or a second tab — silently invalidates the entry the
    // user has *already added to their authenticator*, and the only symptom
    // is "your code is wrong" with no way to tell why. The secret is worth
    // nothing until `enable()` confirms possession, so keeping it stable is
    // free. `rotate` is the deliberate "start over" escape hatch.
    const pending = rotate ? null : user.totpSecret;
    const secret = pending ?? generateSecret();

    if (!pending) {
      // A fresh secret invalidates the replay watermark: that number is a
      // time step burnt against a secret that no longer exists.
      await this.hubUserRepository.update(userId, {
        totpSecret: secret,
        totpLastStep: null,
      });
    }

    const otpauthUrl = generateURI({
      issuer: TOTP_ISSUER,
      label: user.email,
      secret,
      period: TOTP_PERIOD,
    });

    return {
      otpauthUrl,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl),
      // Same information the QR already encodes, spelled out for anyone
      // typing it into a desktop authenticator by hand.
      secret,
    };
  }

  /**
   * Read-only enrolment state, so the UI never has to probe a mutating
   * endpoint to find out where the user stands.
   *
   * Deliberately exposes no secret and no recovery-code material — only
   * whether enrolment is done, half-done, or not started.
   */
  async status(userId: number) {
    const user = await this.hubUserRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      enabled: !!user.totpEnabledAt,
      /** A secret has been generated but never confirmed with a code. */
      pending: !user.totpEnabledAt && !!user.totpSecret,
      recoveryCodesRemaining: user.totpEnabledAt
        ? await this.countUnusedRecoveryCodes(userId)
        : 0,
    };
  }

  /**
   * Confirms the authenticator app really holds the secret, then hands back
   * the recovery codes. This is the only moment those codes exist in
   * plaintext anywhere — the rows store bcrypt hashes.
   */
  async enable(userId: number, code: string) {
    const user = await this.hubUserRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled for this account',
      );
    }
    if (!user.totpSecret) {
      throw new BadRequestException(
        'Start with POST /auth/totp/setup — there is no pending secret to confirm',
      );
    }

    await this.verifyCode(user, code);
    await this.hubUserRepository.update(userId, { totpEnabledAt: new Date() });

    return { recoveryCodes: await this.issueRecoveryCodes(userId) };
  }

  /**
   * Issues a fresh set of recovery codes to an already-enrolled user,
   * invalidating the old set.
   *
   * Gated on a live TOTP code rather than the session alone: recovery codes
   * are a standing bypass of the second factor, so minting new ones has to
   * prove the second factor is still in the caller's hands. Without that, a
   * borrowed session could quietly print itself a permanent way back in.
   *
   * This exists so someone who has spent most of their codes can top up
   * themselves. Losing the authenticator *and* the codes is the admin's
   * problem — see `POST /hub-users/:id/reset-totp`.
   */
  async regenerateRecoveryCodes(userId: number, code: string) {
    const user = await this.hubUserRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.totpEnabledAt) {
      throw new BadRequestException(
        'Two-factor authentication is not enabled for this account',
      );
    }

    await this.verifyCode(user, code);

    return { recoveryCodes: await this.issueRecoveryCodes(userId) };
  }

  /**
   * Verifies a login-time code and burns its time step.
   *
   * Throws rather than returning false so no caller can forget to check.
   */
  async verifyCode(user: HubUser, code: string): Promise<void> {
    if (!user.totpSecret) {
      throw new UnauthorizedException(
        'Two-factor authentication is not set up for this account',
      );
    }

    const token = (code ?? '').trim();
    if (!/^\d{6}$/.test(token)) {
      throw new UnauthorizedException('Invalid authentication code');
    }

    const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    const lastStep = user.totpLastStep;

    // REPLAY GUARD. The watermark is a column, not a module-level Map,
    // because the hub runs under PM2 cluster mode: in-process state is
    // per-worker, so a code burned on worker A would sail through on
    // worker B. See `HubUser.totpLastStep`.
    //
    // otplib rejects an `afterTimeStep` above the current step plus window,
    // so a watermark that far ahead (clock moved backwards, or every step in
    // the window is already spent) is handled here instead of being passed
    // down to throw.
    if (lastStep !== null && lastStep >= currentStep + 1) {
      throw new UnauthorizedException(
        'This authentication code has already been used',
      );
    }

    let result: TotpVerifyResult;
    try {
      result = (await verify({
        secret: user.totpSecret,
        token,
        epochTolerance: TOTP_EPOCH_TOLERANCE,
        period: TOTP_PERIOD,
        ...(lastStep !== null ? { afterTimeStep: lastStep } : {}),
      })) as TotpVerifyResult;
    } catch {
      // A malformed secret or token surfaces as a throw. Either way the
      // caller learns nothing beyond "that didn't work".
      throw new UnauthorizedException('Invalid authentication code');
    }

    if (!result.valid) {
      throw new UnauthorizedException(
        'Invalid or already-used authentication code',
      );
    }

    // Burning the step must be ATOMIC, not a read-then-write. Everything
    // above this line is a read: two cluster workers handling the same code
    // concurrently can both reach here having each seen the old watermark,
    // and a plain UPDATE would let both succeed — reintroducing exactly the
    // replay the watermark exists to stop. Making the write conditional on
    // the watermark still being behind this step means the database picks a
    // winner, and the loser sees `affected === 0`.
    const burned = await this.hubUserRepository
      .createQueryBuilder()
      .update(HubUser)
      .set({ totpLastStep: result.timeStep })
      .where('id = :id', { id: user.id })
      .andWhere('("totpLastStep" IS NULL OR "totpLastStep" < :step)', {
        step: result.timeStep,
      })
      .execute();

    if (!burned.affected) {
      throw new UnauthorizedException(
        'This authentication code has already been used',
      );
    }
  }

  /**
   * Spends one recovery code. Marked used rather than deleted so an operator
   * can still see that a recovery path was taken, and when.
   */
  async consumeRecoveryCode(userId: number, code: string): Promise<void> {
    const normalized = TotpService.normalizeRecoveryCode(code);
    if (!normalized) {
      throw new UnauthorizedException('Invalid recovery code');
    }

    const candidates = await this.recoveryCodeRepository.find({
      where: { hubUserId: userId, usedAt: IsNull() },
    });

    for (const candidate of candidates) {
      if (await bcrypt.compare(normalized, candidate.codeHash)) {
        await this.recoveryCodeRepository.update(candidate.id, {
          usedAt: new Date(),
        });
        return;
      }
    }

    throw new UnauthorizedException('Invalid or already-used recovery code');
  }

  /** How many unused codes are left, for a "you're running low" nudge. */
  async countUnusedRecoveryCodes(userId: number): Promise<number> {
    return this.recoveryCodeRepository.count({
      where: { hubUserId: userId, usedAt: IsNull() },
    });
  }

  /**
   * Replaces the whole set. Returns plaintext — the only time it exists.
   */
  private async issueRecoveryCodes(userId: number): Promise<string[]> {
    await this.recoveryCodeRepository.delete({ hubUserId: userId });

    const plaintext: string[] = [];
    const rows: HubUserRecoveryCode[] = [];

    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      const raw = TotpService.randomRecoveryCode();
      plaintext.push(TotpService.formatRecoveryCode(raw));
      rows.push(
        this.recoveryCodeRepository.create({
          hubUserId: userId,
          codeHash: await bcrypt.hash(raw, BCRYPT_ROUNDS),
          usedAt: null,
        }),
      );
    }

    await this.recoveryCodeRepository.save(rows);
    return plaintext;
  }

  /**
   * Crockford-ish alphabet: no I, L, O, U, so nothing reads ambiguously off
   * a printout.
   */
  private static randomRecoveryCode(): string {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const bytes = crypto.randomBytes(10);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  /** `ABCDE-FGHIJ` — hyphen is cosmetic and stripped before hashing. */
  private static formatRecoveryCode(raw: string): string {
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  }

  /** Undoes whatever the user pasted back into the hashed form. */
  private static normalizeRecoveryCode(code: string): string {
    return (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
