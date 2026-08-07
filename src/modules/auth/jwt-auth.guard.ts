import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const handlerName = context.getHandler().name;
    const className = context.getClass().name;

    // If the token is restricted to password changes only
    if (user?.isChangePasswordOnly) {
      // Only allow auth/change-password and auth/me
      const isAllowed =
        className === 'AuthController' &&
        JwtAuthGuard.CHANGE_PASSWORD_ONLY_HANDLERS.has(handlerName);

      if (!isAllowed) {
        return false;
      }
    }

    // If the token is restricted to TOTP enrolment only.
    //
    // TOTP is mandatory, and `login()` hands an un-enrolled account a token
    // carrying this claim instead of a real session. Enforcing it here rather
    // than trusting the console's `requireTotpSetup` flag is the whole point:
    // a flag in a response body is advice, and a direct API caller ignores it.
    if (user?.isTotpSetupOnly) {
      const isAllowed =
        className === 'AuthController' &&
        JwtAuthGuard.TOTP_SETUP_ONLY_HANDLERS.has(handlerName);

      if (!isAllowed) {
        return false;
      }
    }

    return true;
  }

  /** Handlers on `AuthController` an `isChangePasswordOnly` token may reach. */
  private static readonly CHANGE_PASSWORD_ONLY_HANDLERS = new Set([
    'changePassword',
    'me',
  ]);

  /**
   * Handlers on `AuthController` an `isTotpSetupOnly` token may reach.
   *
   * `totpStatus`/`totpSetup`/`totpEnable` are the enrolment flow itself; `me`
   * is here so the console can render who it is enrolling. Note what is NOT
   * here: `regenerateRecoveryCodes` (meaningless before enrolment) and
   * `changePassword` (a password change is a separate errand, and the
   * first-login branch already runs ahead of this one).
   */
  private static readonly TOTP_SETUP_ONLY_HANDLERS = new Set([
    'totpStatus',
    'totpSetup',
    'totpEnable',
    'me',
  ]);
}
