import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SEC-02 — IP allowlist for the highest-value endpoints (e.g. code generation).
 *
 * Configure with `ADMIN_GEN_IP_ALLOWLIST` (comma-separated). When unset or
 * empty, the guard is a no-op so local dev still works without ceremony.
 *
 * In production you should always set an allowlist for the generation endpoint.
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(IpAllowlistGuard.name);
  private readonly allowlist: Set<string>;
  private readonly varName = 'ADMIN_GEN_IP_ALLOWLIST';

  constructor(config: ConfigService) {
    const raw = config.get<string>(this.varName, '').trim();
    this.allowlist = new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (this.allowlist.size === 0) {
      this.logger.warn(
        `IP allowlist not configured (${this.varName}). Set this in production for sensitive endpoints.`,
      );
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (this.allowlist.size === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    // req.ip is the trusted IP if `app.set('trust proxy', ...)` is set,
    // otherwise the immediate socket address. We accept either match.
    const candidates = [
      req.ip,
      req.connection?.remoteAddress,
      req.socket?.remoteAddress,
      ...((req.headers['x-forwarded-for'] || '') as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ].filter(Boolean);

    for (const c of candidates) {
      const normalized = String(c).replace(/^::ffff:/, '');
      if (this.allowlist.has(normalized)) return true;
    }

    this.logger.warn(
      `IP allowlist denied request. candidates=${JSON.stringify(candidates)}`,
    );
    throw new ForbiddenException('IP not in allowlist');
  }
}
