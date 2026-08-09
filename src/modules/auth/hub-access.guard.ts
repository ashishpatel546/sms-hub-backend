import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MIN_ACCESS_KEY } from '../../common/decorators/min-access.decorator';
import { HubAccessLevel } from '../hub-users/entities/hub-user.entity';

/**
 * Ranking behind `@MinAccess()`. Gaps are intentional so a level can be
 * slotted between two existing ones without renumbering the others.
 */
export const HUB_ACCESS_HIERARCHY: Record<HubAccessLevel, number> = {
  [HubAccessLevel.VIEW]: 10,
  [HubAccessLevel.EDIT]: 20,
  [HubAccessLevel.ADMIN]: 30,
};

/**
 * Hierarchical access control for the hub console, mirroring
 * `MinRoleGuard` in `sms-backend`.
 *
 * Access is granted when:
 *   HUB_ACCESS_HIERARCHY[user.access] >= HUB_ACCESS_HIERARCHY[minAccess]
 *
 * A route with no `@MinAccess()` is unrestricted by this guard (it still
 * needs `JwtAuthGuard` for authentication).
 */
@Injectable()
export class HubAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minAccess = this.reflector.getAllAndOverride<HubAccessLevel>(
      MIN_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @MinAccess() set — open access.
    if (!minAccess) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // FAIL CLOSED on a missing or unrecognised `access` claim.
    //
    // There is deliberately no "legacy token" fallback here. Treating an
    // absent claim as ADMIN would mean a token that merely OMITS the claim
    // outranks one that honestly declares VIEW — privilege escalation by
    // omission, and a permanent trap for anyone who later mints a token by
    // hand. It buys nothing either: `@MinAccess()` is only ever applied to
    // routes introduced alongside the claim itself, so no pre-existing
    // session was calling them. The worst case is that an operator holding
    // a token minted before the deploy re-logs in once.
    const claimed: unknown = user.access;
    if (typeof claimed !== 'string' || !(claimed in HUB_ACCESS_HIERARCHY)) {
      return false;
    }

    const userLevel = HUB_ACCESS_HIERARCHY[claimed as HubAccessLevel] ?? 0;
    const requiredLevel = HUB_ACCESS_HIERARCHY[minAccess] ?? 0;

    return userLevel >= requiredLevel;
  }
}
