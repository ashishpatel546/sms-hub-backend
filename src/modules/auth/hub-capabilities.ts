import { Logger } from '@nestjs/common';

import { HubAccessLevel } from '../hub-users/entities/hub-user.entity';
import { HUB_ACCESS_HIERARCHY } from './hub-access.guard';

/**
 * The hub's own permission rules, published so the console can disable the
 * controls a signed-in operator cannot use instead of rendering buttons that
 * 403.
 *
 * This table is a *mirror*, never a source of truth: `@MinAccess()` on the
 * route plus `HubAccessGuard` remain the only thing that decides an actual
 * request. Every entry below restates a decorator that already exists — see
 * the mapping in each comment. If the two ever disagree the server still wins;
 * the only consequence is a console button that looks wrong.
 *
 * Names are dot-namespaced and STABLE: the console pins them in `disabled=`
 * checks, so rename a capability only alongside a console change. Grouping is
 * by console screen, not by HTTP route, because one screen is usually several
 * routes at the same level.
 */
export const HUB_CAPABILITIES = {
  /**
   * The whole `/hub-users` controller — list, invite, edit profile, change
   * access level, activate/deactivate, reset password, reset TOTP, delete.
   * The controller carries a single class-level `@MinAccess(ADMIN)`, so one
   * capability covers the screen.
   */
  'hubUser.manage': HubAccessLevel.ADMIN,

  /**
   * Reads on `/ai-admin` that answer "what is going on": `GET overview`,
   * `GET users`, `GET plans`. Note that the ADMIN-only reads (settings,
   * llm-*, feature-roles) are deliberately NOT covered by this — they have
   * their own entries below.
   */
  'ai.read': HubAccessLevel.VIEW,

  /** `POST /ai-admin/users/:userId/grant-credits`. */
  'ai.grantCredits': HubAccessLevel.ADMIN,

  /** `POST /ai-admin/users/:userId/grant-plan`. */
  'ai.grantPlan': HubAccessLevel.ADMIN,

  /**
   * Authoring the price list: `POST plans`, `PATCH plans/:planId`,
   * `DELETE plans/:planId`. Reading the list is `ai.read`.
   */
  'ai.plan.manage': HubAccessLevel.ADMIN,

  /** `GET /ai-admin/settings` and `PUT /ai-admin/settings/:key` — read included. */
  'ai.settings': HubAccessLevel.ADMIN,

  /** `GET`/`PUT`/`POST llm-tiers` and `DELETE llm-tiers/:tierId`. */
  'ai.llmTiers': HubAccessLevel.ADMIN,

  /** `GET`/`PUT /ai-admin/llm-models` — the provider shortlist. */
  'ai.llmModels': HubAccessLevel.ADMIN,

  /** `GET`/`PUT /ai-admin/llm-pricing`. */
  'ai.llmPricing': HubAccessLevel.ADMIN,

  /** `GET`/`PUT /ai-admin/feature-roles`. */
  'ai.featureRoles': HubAccessLevel.ADMIN,

  /**
   * The authenticated self-service routes on `/auth`: sessions, logout-all,
   * change-password, and the TOTP enrolment/recovery-code endpoints. VIEW by
   * design — these act on the caller's own account, and gating them higher
   * would leave a VIEW operator unable to log out or enrol in the second
   * factor the platform requires of them.
   *
   * Present (rather than omitted as "always true") so the console never has
   * to hardcode the assumption that some screens need no check.
   */
  'account.selfService': HubAccessLevel.VIEW,
} as const;

/** Every capability name published by {@link HUB_CAPABILITIES}. */
export type HubCapability = keyof typeof HUB_CAPABILITIES;

/**
 * Rank a claimed access level, failing closed exactly as `HubAccessGuard`
 * does: anything that is not a recognised level scores 0 and therefore
 * satisfies no capability.
 */
function rankOf(level: unknown): number {
  if (typeof level !== 'string' || !(level in HUB_ACCESS_HIERARCHY)) return 0;
  return HUB_ACCESS_HIERARCHY[level as HubAccessLevel] ?? 0;
}

/**
 * Resolve the full capability map for one access level.
 *
 * Hierarchical, matching `HubAccessGuard`: ADMIN satisfies an EDIT
 * requirement, EDIT satisfies VIEW. An unknown or missing level yields all
 * `false` rather than throwing — the console can render a read-only shell.
 */
export function capabilitiesFor(
  level: HubAccessLevel | string | undefined | null,
): Record<HubCapability, boolean> {
  const userRank = rankOf(level);

  const entries = Object.entries(HUB_CAPABILITIES) as [
    HubCapability,
    HubAccessLevel,
  ][];

  const can = {} as Record<HubCapability, boolean>;
  for (const [capability, required] of entries) {
    // An unrecognised requirement is unsatisfiable, not free.
    const requiredRank =
      HUB_ACCESS_HIERARCHY[required] ?? Number.POSITIVE_INFINITY;
    can[capability] = userRank >= requiredRank;
  }
  return can;
}

/**
 * Cheap anti-drift self-check, run once at module init.
 *
 * This repo has no test runner, and the failure mode being guarded against is
 * dull but real: someone adds a capability with a level that is a typo, or a
 * string that is no longer a member of `HubAccessLevel` after the enum moves.
 * `capabilitiesFor` fails such an entry closed (see the `POSITIVE_INFINITY`
 * above), which is safe but silent — the console would just hide a control
 * from everyone with no explanation. Logging it loudly at boot turns a
 * mystery into a one-line diagnosis.
 *
 * Deliberately non-fatal: a bad row degrades one button, and refusing to boot
 * the whole platform console over it is the worse trade.
 *
 * @returns the offending `capability: level` pairs, empty when the table is
 * sound (returned rather than only logged so a caller can assert on it).
 */
export function assertHubCapabilitiesValid(
  logger: Pick<Logger, 'error'> = new Logger('HubCapabilities'),
): string[] {
  const valid = new Set<string>(Object.values(HubAccessLevel));

  const invalid = Object.entries(HUB_CAPABILITIES)
    .filter(([, level]) => !valid.has(level))
    .map(([capability, level]) => `${capability}=${String(level)}`);

  if (invalid.length > 0) {
    logger.error(
      `HUB_CAPABILITIES has ${invalid.length} entry/entries whose required ` +
        `level is not a HubAccessLevel (${[...valid].join('|')}): ` +
        `${invalid.join(', ')}. These capabilities will report false for ` +
        `every user until fixed.`,
    );
  }

  return invalid;
}
