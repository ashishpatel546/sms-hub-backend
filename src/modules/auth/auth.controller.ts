import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Headers,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  EnableTotpDto,
  RegenerateRecoveryCodesDto,
  TotpRecoveryDto,
} from './dto/totp.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { HubAccessGuard } from './hub-access.guard';
import { MinAccess } from '../../common/decorators/min-access.decorator';
import { HubAccessLevel } from '../hub-users/entities/hub-user.entity';
import { capabilitiesFor } from './hub-capabilities';

/**
 * Access levels here are all VIEW, and deliberately so: every authenticated
 * route on this controller acts on the caller's *own* account — their
 * sessions, their password, their second factor. Gating self-service behind
 * EDIT would leave a VIEW user unable to log out or enrol in the TOTP the
 * platform requires of them.
 *
 * They are stated rather than left off because `HubAccessGuard` fails closed
 * on a missing or unrecognised `access` claim, so `@MinAccess(VIEW)` is a
 * real check ("a well-formed hub token") and not a no-op. The `@Public`
 * routes carry no guard at all — there is no user to rank yet.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly totpService: TotpService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Login',
    description:
      'Password first, then the second factor, then everything else. ' +
      'Enrolled account with no `totpCode` → `{ requireTotp: true }` and no ' +
      'tokens. Account the admin has reset → `{ requirePasswordChange: true }` ' +
      'with a change-password-only token, but only AFTER TOTP has been ' +
      'satisfied. Never-enrolled account → `{ requireTotpSetup: true }` with a ' +
      '15-minute setup-only token and no refresh token. Otherwise a full ' +
      'session.',
  })
  login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent: string,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Request() req: any,
  ) {
    return this.authService.login(
      body.identifier,
      body.password,
      {
        deviceInfo: userAgent,
        ipAddress: forwardedFor || req.ip,
      },
      body.totpCode,
    );
  }

  /**
   * Public by design — the caller's access token is expected to be dead by
   * the time they get here. The refresh token in the body is the credential.
   */
  @Public()
  @Post('refresh-token')
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  refreshToken(
    @Body() body: RefreshTokenDto,
    @Headers('user-agent') userAgent: string,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Request() req: any,
  ) {
    return this.authService.refreshSession(body.refreshToken, {
      deviceInfo: userAgent,
      ipAddress: forwardedFor || req.ip,
    });
  }

  /** Public for the same reason as refresh — logout must work on a dead token. */
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session' })
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session for the current admin' })
  logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user.sub);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current admin' })
  sessions(
    @Request() req: any,
    @Query('currentRefreshToken') currentRefreshToken?: string,
  ) {
    return this.authService.getSessions(req.user.sub, currentRefreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  me(@Request() req: any) {
    return req.user;
  }

  /**
   * The console's copy of the rules it is already subject to, so it can
   * disable a control instead of rendering a button that 403s. Mirrors
   * `GET /admin/capabilities` in `sms-backend`.
   *
   * VIEW like the rest of this controller, and for the same reason: it
   * describes the *caller's own* permissions, so every access level must be
   * able to read it — a VIEW operator that could not fetch this would get a
   * console with everything disabled, or worse, everything enabled.
   *
   * It answers only for `req.user.access`; there is no way to ask about
   * somebody else's level, and the response carries nothing but the boolean
   * map and the caller's own level. Notably absent is the *table* of required
   * levels — the console needs "may I", not "what would it take".
   *
   * Deliberately NOT in either allowlist in `JwtAuthGuard`: a
   * change-password-only or TOTP-setup-only token is mid-login and has no
   * console to render yet, so it has no business enumerating capabilities.
   * Adding `capabilities` to those sets would be the whole point undone.
   */
  @Get('capabilities')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'What the current admin may do in the console',
    description:
      'Returns `{ accessLevel, can }` where `can` maps each capability name ' +
      'to a boolean for THIS caller. Advisory only — every route still ' +
      'enforces its own `@MinAccess()`, so a console that ignores this gets ' +
      '403s rather than access.',
  })
  capabilities(@Request() req: any) {
    const accessLevel = req.user?.access as HubAccessLevel;
    return {
      accessLevel,
      can: capabilitiesFor(accessLevel),
    };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password on first login' })
  changePassword(@Request() req: any, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, body.password);
  }

  // ── TOTP ──────────────────────────────────────────────────────────────────

  /**
   * Enrolment happens on the setup-only session `login()` hands an
   * un-enrolled account: a 15-minute token, no refresh token, and — enforced
   * in `JwtAuthGuard`, not merely advertised via `requireTotpSetup` — good
   * for nothing but the three routes below plus `me`.
   */
  @Get('totp/status')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Whether two-factor is enabled, half-enrolled, or not started',
  })
  totpStatus(@Request() req: any) {
    return this.totpService.status(req.user.sub);
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a TOTP secret and return its otpauth URL + QR code',
    description:
      'Returns the pending secret if enrolment was already started, so a page ' +
      'reload does not invalidate a QR the user has already scanned. Pass ' +
      '`{ "rotate": true }` to deliberately abandon it and start over.',
  })
  totpSetup(@Request() req: any, @Body() body?: { rotate?: boolean }) {
    return this.totpService.setup(req.user.sub, body?.rotate === true);
  }

  @Post('totp/enable')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Confirm the first code and enable TOTP. Returns recovery codes ONCE — they are stored hashed and cannot be shown again',
  })
  totpEnable(@Request() req: any, @Body() body: EnableTotpDto) {
    return this.totpService.enable(req.user.sub, body.code);
  }

  /**
   * Self-service top-up for someone running low on recovery codes. Requires
   * a live TOTP code, not just the session: the codes it hands back are a
   * standing bypass of the second factor, so issuing them has to prove the
   * second factor is still in the caller's hands.
   *
   * Not reachable on a setup-only token — there is nothing to regenerate
   * before enrolment. The lost-everything case is the admin's
   * `POST /hub-users/:id/reset-totp`.
   */
  @Post('totp/recovery-codes/regenerate')
  @UseGuards(JwtAuthGuard, HubAccessGuard)
  @MinAccess(HubAccessLevel.VIEW)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Replace the recovery codes with a fresh set of 10. Shown ONCE; the previous set stops working immediately',
  })
  regenerateRecoveryCodes(
    @Request() req: any,
    @Body() body: RegenerateRecoveryCodesDto,
  ) {
    return this.totpService.regenerateRecoveryCodes(req.user.sub, body.code);
  }

  /**
   * Public for the same reason `login` is: the caller has no session yet.
   * The body carries the password as well as the recovery code — a recovery
   * code is a *second* factor, not a standalone credential.
   */
  @Public()
  @Post('totp/recovery')
  @ApiOperation({
    summary: 'Complete login with a single-use recovery code instead of a TOTP',
  })
  totpRecovery(
    @Body() body: TotpRecoveryDto,
    @Headers('user-agent') userAgent: string,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Request() req: any,
  ) {
    return this.authService.loginWithRecoveryCode(
      body.identifier,
      body.password,
      body.code,
      {
        deviceInfo: userAgent,
        ipAddress: forwardedFor || req.ip,
      },
    );
  }
}
