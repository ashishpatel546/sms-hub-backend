import { SetMetadata } from '@nestjs/common';
import { HubAccessLevel } from '../../modules/hub-users/entities/hub-user.entity';

export const MIN_ACCESS_KEY = 'minAccess';

/**
 * Minimum hub access level required for a route (or a whole controller).
 *
 * Hierarchical: `@MinAccess(HubAccessLevel.EDIT)` admits EDIT *and* ADMIN.
 * Pair with `HubAccessGuard`:
 *
 *   @UseGuards(JwtAuthGuard, HubAccessGuard)
 *   @MinAccess(HubAccessLevel.ADMIN)
 */
export const MinAccess = (level: HubAccessLevel) =>
  SetMetadata(MIN_ACCESS_KEY, level);
