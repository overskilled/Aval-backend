import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ContactService } from './contact.service';
import { ContactInquiryDto } from './dto/contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly svc: ContactService) {}

  // Tighter throttle than the global default — public endpoint, abuse target.
  @Throttle({ short: { limit: 2, ttl: 60_000 }, medium: { limit: 8, ttl: 60 * 60_000 } })
  @Post()
  @HttpCode(200)
  submit(@Body() dto: ContactInquiryDto, @Req() req: Request) {
    return this.svc.submit(dto, {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
