import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { OtpPurpose, User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { SELF_REGISTERABLE_ROLES, UserRole } from '../users/role.enum';
import { MailService } from '../mail/mail.service';
import { OtpService } from './otp.service';
import {
  ForgotPasswordDto,
  LoginDto,
  LoginVerifyDto,
  RegisterDto,
  ResendOtpDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

export interface AuthPayload {
  sub: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly otp: OtpService,
  ) {}

  private async signToken(user: User) {
    const payload: AuthPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload);
  }

  async register(dto: RegisterDto) {
    if (!SELF_REGISTERABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('Role not allowed at signup');
    }
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const fullName = `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim();
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      fullName,
      phone: dto.phone,
      organisation: dto.organisation,
      country: dto.country ?? 'Cameroun',
      roleTitle: dto.roleTitle,
      role: dto.role,
    });

    // Issue an email-verify OTP and send it. We await so the sender's logs
    // surface immediately on the request lifecycle; failures are logged but
    // do not break registration (account is created either way).
    const { code } = await this.otp.issue({
      email: user.email,
      purpose: 'email_verify',
      userId: user.id,
    });
    try {
      await this.mail.sendOtpCode(user.email, user.fullName, code, 'email_verify');
    } catch (e) {
      this.logger.error(`OTP mail failed at register: ${(e as Error).message}`);
    }

    const token = await this.signToken(user);
    return { token, user: this.users.toPublic(user) };
  }

  /**
   * Step 1 of login: validate credentials. For non-admin users, issue a 6-digit
   * email OTP and return `{ requiresOtp: true }` instead of a token. The admin
   * role is exempt for now (separate hardware MFA path coming in SEC-01).
   */
  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    const dummyHash =
      '$2a$12$abcdefghijklmnopqrstuvCu7yJfZxJtK4UM3Z0g4tDqwZuHzrG.l2';
    const ok = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? dummyHash,
    );
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Admin path: skip OTP. (Will be replaced by hardware MFA later.)
    if (user.role === 'admin') {
      const updated = await this.users.update(user.id, {
        lastLoginAt: new Date(),
      });
      const token = await this.signToken(updated);
      return { token, user: this.users.toPublic(updated), requiresOtp: false };
    }

    // Everyone else: issue and email a login OTP. The token is only
    // returned after the OTP step (`verifyLoginOtp`).
    const { code } = await this.otp.issue({
      email: user.email,
      purpose: 'login_2fa',
      userId: user.id,
    });
    try {
      await this.mail.sendOtpCode(user.email, user.fullName, code, 'login_2fa');
    } catch (e) {
      this.logger.error(`Login OTP mail failed: ${(e as Error).message}`);
    }
    return { requiresOtp: true, email: user.email };
  }

  /** Step 2 of login: validate the 6-digit code and issue the JWT. */
  async verifyLoginOtp(dto: LoginVerifyDto) {
    await this.otp.verify({
      email: dto.email,
      purpose: 'login_2fa',
      code: dto.code,
    });
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Account not found');
    const updated = await this.users.update(user.id, {
      lastLoginAt: new Date(),
    });
    const token = await this.signToken(updated);
    return { token, user: this.users.toPublic(updated) };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.users.toPublic(user);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    await this.otp.verify({
      email: dto.email,
      purpose: 'email_verify',
      code: dto.code,
    });
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new BadRequestException('Account not found');
    const updated = await this.users.update(user.id, { emailVerified: true });
    return { ok: true, user: this.users.toPublic(updated) };
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.users.findByEmail(dto.email);
    // Don't reveal account existence.
    if (!user) return { ok: true };
    if (dto.purpose === 'email_verify' && user.emailVerified) {
      return { ok: true };
    }
    const { code } = await this.otp.issue({
      email: user.email,
      purpose: dto.purpose,
      userId: user.id,
    });
    await this.mail.sendOtpCode(
      user.email,
      user.fullName,
      code,
      dto.purpose as 'email_verify' | 'password_reset' | 'login_2fa',
    );
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) return { ok: true };
    const { code } = await this.otp.issue({
      email: user.email,
      purpose: 'password_reset',
      userId: user.id,
    });
    await this.mail.sendOtpCode(user.email, user.fullName, code, 'password_reset');
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    await this.otp.verify({
      email: dto.email,
      purpose: 'password_reset',
      code: dto.code,
    });
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new BadRequestException('Account not found');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.users.update(user.id, { passwordHash });
    return { ok: true };
  }
}
