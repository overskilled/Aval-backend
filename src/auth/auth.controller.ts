import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  LoginVerifyDto,
  RegisterDto,
  ResendOtpDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // SEC-02 — tighter throttle on credential-touching endpoints to slow
  // brute-force attempts and OTP enumeration. Limits are per-IP.
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 12, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 12, ttl: 60_000 } })
  @Post('verify-login-otp')
  @HttpCode(200)
  verifyLoginOtp(@Body() dto: LoginVerifyDto) {
    return this.auth.verifyLoginOtp(dto);
  }

  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 5, ttl: 60_000 } })
  @Post('resend-otp')
  @HttpCode(200)
  resend(@Body() dto: ResendOtpDto) {
    return this.auth.resendOtp(dto);
  }

  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 8, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: PublicUser) {
    return user;
  }
}
