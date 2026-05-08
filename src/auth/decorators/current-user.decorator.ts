import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PublicUser } from '../../users/users.service';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as PublicUser;
  },
);
