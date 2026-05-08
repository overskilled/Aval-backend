import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { ContactInquiryDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: ContactInquiryDto, meta: { ip?: string; userAgent?: string }) {
    // Honeypot — silent reject.
    if (dto.website) {
      this.logger.warn(`Honeypot tripped from ip=${meta.ip || 'unknown'}`);
      return { ok: true };
    }

    const inbox = this.config.get<string>('CONTACT_INBOX_EMAIL');
    if (!inbox) {
      this.logger.error('CONTACT_INBOX_EMAIL is not configured.');
      throw new BadRequestException('Contact inbox is not configured.');
    }

    const receivedAt = new Date();
    await this.mail.sendContactInquiry({
      to: inbox,
      submitter: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        org: dto.organisation?.trim() || undefined,
        role: dto.role?.trim() || undefined,
        country: dto.country?.trim() || undefined,
      },
      message: (dto.message || '').trim(),
      receivedAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // Best‑effort acknowledgement to the submitter — failures don't affect the response.
    this.mail
      .sendContactConfirmation({ to: dto.email.trim().toLowerCase(), name: dto.name.trim() })
      .catch((err) =>
        this.logger.warn(`Submitter confirmation failed: ${(err as Error).message}`),
      );

    return { ok: true };
  }
}
