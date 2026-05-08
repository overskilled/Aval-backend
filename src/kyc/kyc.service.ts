import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ReviewKycDto, SubmitKycDto } from './dto/kyc.dto';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async getMine(userId: string) {
    return this.prisma.kycSubmission.findUnique({
      where: { userId },
      include: { documents: true, institution: true },
    });
  }

  async submit(userId: string, dto: SubmitKycDto) {
    const institution = await this.prisma.institution.findUnique({
      where: { ownerId: userId },
    });
    if (!institution) {
      throw new BadRequestException(
        'Register your institution profile before submitting KYC',
      );
    }
    const existing = await this.prisma.kycSubmission.findUnique({
      where: { userId },
    });
    if (existing && existing.status === 'approved') {
      throw new BadRequestException('Your KYC has already been approved');
    }
    if (existing && existing.status === 'pending') {
      throw new BadRequestException('A KYC submission is already pending review');
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.kycDocument.deleteMany({ where: { submissionId: existing.id } });
        await tx.kycSubmission.delete({ where: { id: existing.id } });
      }
      const created = await tx.kycSubmission.create({
        data: {
          userId,
          institutionId: institution.id,
          legalRepName: dto.legalRepName,
          legalRepRole: dto.legalRepRole,
          legalRepIdType: dto.legalRepIdType,
          legalRepIdNumber: dto.legalRepIdNumber,
          notes: dto.notes,
          status: 'pending',
          documents: {
            create: dto.documents.map((d) => ({
              kind: d.kind,
              filename: d.filename,
              url: d.url,
              mimeType: d.mimeType,
              size: d.size,
            })),
          },
        },
        include: { documents: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { kycStatus: 'pending' },
      });
      return created;
    });
    return submission;
  }

  async listAll() {
    return this.prisma.kycSubmission.findMany({
      include: {
        user: true,
        institution: true,
        documents: true,
        reviewedBy: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getOne(id: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id },
      include: {
        user: true,
        institution: true,
        documents: true,
        reviewedBy: true,
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  async review(reviewerId: string, id: string, dto: ReviewKycDto) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'pending') {
      throw new ForbiddenException(
        `Submission is ${submission.status} and cannot be reviewed again`,
      );
    }
    if (dto.decision === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.kycSubmission.update({
        where: { id },
        data: {
          status: dto.decision,
          rejectionReason: dto.decision === 'rejected' ? dto.rejectionReason : null,
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        },
        include: { user: true, institution: true, documents: true },
      }),
      this.prisma.user.update({
        where: { id: submission.userId },
        data: { kycStatus: dto.decision },
      }),
    ]);

    // Notify the institution owner. Fire-and-forget; mail failures already
    // logged inside MailService.
    try {
      await this.mail.sendKycDecision({
        to: updated.user.email,
        fullName: updated.user.fullName,
        institutionName: updated.institution.legalName,
        decision: dto.decision,
        reason: dto.rejectionReason,
      });
    } catch (e) {
      this.logger.error(`KYC decision mail failed: ${(e as Error).message}`);
    }

    return updated;
  }
}
