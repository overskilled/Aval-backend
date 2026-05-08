import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Sku } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateSkuDto, ReviewSkuDto, UpdateSkuDto } from './dto/sku.dto';

function newSkuCode() {
  // 6-char base32-ish code, e.g. AVL-SKU-7K3X9P
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length];
  return `AVL-SKU-${s}`;
}

@Injectable()
export class SkusService {
  private readonly logger = new Logger(SkusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** A user can register SKUs only if they own an institution and KYC is approved. */
  private async requireApprovedInstitution(userId: string) {
    const inst = await this.prisma.institution.findUnique({
      where: { ownerId: userId },
      include: { kyc: true },
    });
    if (!inst) {
      throw new ForbiddenException(
        'Register your institution profile before adding SKUs',
      );
    }
    if (!inst.kyc || inst.kyc.status !== 'approved') {
      throw new ForbiddenException(
        'Your institution must complete KYC verification before registering SKUs',
      );
    }
    return inst;
  }

  async listMine(userId: string) {
    const inst = await this.prisma.institution.findUnique({
      where: { ownerId: userId },
    });
    if (!inst) return [];
    return this.prisma.sku.findMany({
      where: { institutionId: inst.id },
      orderBy: { submittedAt: 'desc' },
      include: { reviewedBy: true },
    });
  }

  async getOne(userId: string, id: string) {
    const sku = await this.prisma.sku.findUnique({
      where: { id },
      include: { reviewedBy: true, institution: true, owner: true },
    });
    if (!sku) throw new NotFoundException('SKU not found');
    if (sku.ownerId !== userId) {
      throw new ForbiddenException('Not your SKU');
    }
    return sku;
  }

  async create(userId: string, dto: CreateSkuDto) {
    const inst = await this.requireApprovedInstitution(userId);

    let code = newSkuCode();
    for (let i = 0; await this.prisma.sku.findUnique({ where: { code } }); i++) {
      code = newSkuCode();
      if (i > 5) throw new BadRequestException('Could not generate SKU code');
    }

    return this.prisma.sku.create({
      data: {
        code,
        institutionId: inst.id,
        ownerId: userId,
        name: dto.name,
        category: dto.category,
        packaging: dto.packaging,
        declaredVolumeMl: dto.declaredVolumeMl,
        batchFormat: dto.batchFormat,
        status: 'pending',
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSkuDto) {
    const sku = await this.getOne(userId, id);
    if (sku.status !== 'pending') {
      throw new BadRequestException(
        'Only SKUs that are still pending review can be edited',
      );
    }
    return this.prisma.sku.update({
      where: { id },
      data: dto,
    });
  }

  async withdraw(userId: string, id: string) {
    const sku = await this.getOne(userId, id);
    if (sku.status !== 'pending') {
      throw new BadRequestException(
        'Only pending SKUs can be withdrawn',
      );
    }
    await this.prisma.sku.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------- admin ----------------

  async adminList(filter?: { status?: Sku['status'] }) {
    return this.prisma.sku.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: { submittedAt: 'desc' },
      include: { institution: true, owner: true, reviewedBy: true },
    });
  }

  async adminGetOne(id: string) {
    const sku = await this.prisma.sku.findUnique({
      where: { id },
      include: { institution: true, owner: true, reviewedBy: true },
    });
    if (!sku) throw new NotFoundException('SKU not found');
    return sku;
  }

  async review(reviewerId: string, id: string, dto: ReviewSkuDto) {
    const sku = await this.prisma.sku.findUnique({
      where: { id },
      include: { owner: true, institution: true },
    });
    if (!sku) throw new NotFoundException('SKU not found');
    if (sku.status !== 'pending') {
      throw new ForbiddenException(
        `SKU is ${sku.status} and cannot be reviewed again`,
      );
    }
    if (dto.decision === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }
    const updated = await this.prisma.sku.update({
      where: { id },
      data: {
        status: dto.decision,
        rejectionReason:
          dto.decision === 'rejected' ? dto.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
      include: { owner: true, institution: true, reviewedBy: true },
    });

    // Notify the manufacturer (fire-and-forget; mail failures already logged).
    try {
      await this.mail.sendSkuDecision({
        to: sku.owner.email,
        fullName: sku.owner.fullName,
        skuName: sku.name,
        skuCode: sku.code,
        decision: dto.decision,
        reason: dto.rejectionReason,
      });
    } catch (e) {
      this.logger.error(`SKU decision mail failed: ${(e as Error).message}`);
    }

    return updated;
  }
}
