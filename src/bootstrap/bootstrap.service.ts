import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * On first start, create a single admin user from BOOTSTRAP_ADMIN_EMAIL/PASSWORD
 * if no admin exists yet. Logs a one-time warning to rotate the password.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL');
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    if (!email || !password) return;

    const existing = await this.prisma.user.findFirst({
      where: { role: 'admin' },
    });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName: 'Aval',
        lastName: 'Admin',
        fullName: 'Aval Admin',
        role: 'admin',
        emailVerified: true,
      },
    });
    this.logger.warn(
      `Bootstrap admin created: ${email}. ROTATE THE PASSWORD IMMEDIATELY.`,
    );
  }
}
