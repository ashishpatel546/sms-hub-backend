import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'default_jwt_secret_change_me',
      ),
    });
  }

  // Not async: nothing here awaits, and Passport accepts a plain return.
  validate(payload: any) {
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      // Hub-local privilege. Passed through as-is, including `undefined` for
      // tokens minted before access levels existed — `HubAccessGuard` owns
      // the decision about what a missing claim means.
      access: payload.access,
      // Marks the token as hub-issued. `sms-backend` accepts the same
      // signature, so a claim that says which console minted it is worth
      // having on hand.
      scope: payload.scope,
      isChangePasswordOnly: !!payload.isChangePasswordOnly,
      // Same shape of restriction as `isChangePasswordOnly`: a token minted
      // for an account that has never enrolled in TOTP, good only for the
      // enrolment endpoints. `JwtAuthGuard` owns the allowlist.
      isTotpSetupOnly: !!payload.isTotpSetupOnly,
    };
  }
}
