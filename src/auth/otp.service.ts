import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get ttlMs() {
    return Number(this.config.get('OTP_TTL_MINUTES') ?? 10) * 60 * 1000;
  }

  private get cooldownMs() {
    return Number(this.config.get('OTP_RESEND_COOLDOWN_SECONDS') ?? 30) * 1000;
  }

  private get maxAttempts() {
    return Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 6);
  }

  /** 6-digit code as string, cryptographically random. */
  generateCode(): string {
    const n = crypto.randomInt(0, 1_000_000);
    return n.toString().padStart(6, '0');
  }

  async issue(args: {
    email: string;
    purpose: OtpPurpose;
    userId?: string | null;
  }): Promise<{ code: string }> {
    const email = args.email.toLowerCase();

    // Cooldown: don't issue if a fresh, unconsumed token already exists.
    const recent = await this.prisma.otpToken.findFirst({
      where: {
        email,
        purpose: args.purpose,
        consumedAt: null,
        createdAt: { gte: new Date(Date.now() - this.cooldownMs) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException(
        'Please wait a moment before requesting another code',
      );
    }

    // Invalidate any older unconsumed tokens for this email+purpose.
    await this.prisma.otpToken.updateMany({
      where: { email, purpose: args.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    await this.prisma.otpToken.create({
      data: {
        email,
        purpose: args.purpose,
        userId: args.userId ?? null,
        codeHash,
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });
    return { code };
  }

  /** Verify-and-consume the latest unconsumed OTP for (email, purpose). */
  async verify(args: {
    email: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<{ userId: string | null }> {
    const email = args.email.toLowerCase();
    const otp = await this.prisma.otpToken.findFirst({
      where: { email, purpose: args.purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      throw new BadRequestException('Invalid or expired code');
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Code has expired');
    }
    if (otp.attempts >= this.maxAttempts) {
      // Burn the token to prevent further attempts.
      await this.prisma.otpToken.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException(
        'Too many invalid attempts. Request a new code.',
      );
    }
    const ok = await bcrypt.compare(args.code, otp.codeHash);
    if (!ok) {
      await this.prisma.otpToken.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired code');
    }
    await this.prisma.otpToken.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    return { userId: otp.userId };
  }
}
