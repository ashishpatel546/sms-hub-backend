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

    // If the token is restricted to password changes only
    if (user?.isChangePasswordOnly) {
      const handlerName = context.getHandler().name;
      const className = context.getClass().name;

      // Only allow auth/change-password and auth/me
      const isAllowed =
        className === 'AuthController' &&
        (handlerName === 'changePassword' || handlerName === 'me');

      if (!isAllowed) {
        return false;
      }
    }

    return true;
  }
}
