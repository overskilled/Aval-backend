import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Second factor for admin endpoints: requires a static shared-secret header
 * (X-Admin-Token) on top of a valid admin JWT. Rotate via env.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_API_TOKEN');
    if (!expected) {
      throw new ForbiddenException('Admin token not configured');
    }
    const req = ctx.switchToHttp().getRequest();
    const provided = req.headers['x-admin-token'];
    if (typeof provided !== 'string' || provided !== expected) {
      throw new ForbiddenException('Missing or invalid admin token');
    }
    return true;
  }
}
