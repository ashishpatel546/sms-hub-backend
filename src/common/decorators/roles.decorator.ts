import { SetMetadata } from '@nestjs/common';
import { HubUserRole } from '../../modules/hub-users/entities/hub-user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: HubUserRole[]) => SetMetadata(ROLES_KEY, roles);
