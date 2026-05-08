import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { VerifyService } from './verify.service';

class VerifyDto {
  @IsString()
  @IsNotEmpty()
  // base64url-encoded JSON; sane upper bound to reject obviously malicious input
  @MaxLength(2_000)
  token: string;
}

/**
 * Public verification endpoint — no auth, citizen-facing. Throttled tightly
 * per IP so scrapers can't enumerate hashes. A single citizen can scan
 * 30 distinct codes per minute, which is far above realistic shopping use.
 */
@Controller('verify')
export class VerifyController {
  constructor(private readonly svc: VerifyService) {}

  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 30, ttl: 60_000 },
    long: { limit: 600, ttl: 60 * 60_000 },
  })
  @Post()
  @HttpCode(200)
  verify(@Body() dto: VerifyDto) {
    return this.svc.verify(dto.token);
  }
}
