import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Batch } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateBatchDto, ReviewBatchDto } from './dto/batch.dto';

function newBatchCode() {
  // AVL-BTH-XXXXXX, base32-ish, 6 chars
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length];
  return `AVL-BTH-${s}`;
}

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async listMine(userId: string) {
    const inst = await this.prisma.institution.findUnique({
      where: { ownerId: userId },
    });
    if (!inst) return [];
    return this.prisma.batch.findMany({
      where: { institutionId: inst.id },
      orderBy: { submittedAt: 'desc' },
      include: { sku: true, reviewedBy: true },
    });
  }

  async getOne(userId: string, id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: { sku: true, institution: true, owner: true, reviewedBy: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.ownerId !== userId) {
      throw new ForbiddenException('Not your batch');
    }
    return batch;
  }

  async create(userId: string, dto: CreateBatchDto) {
    // Validate SKU: must exist, belong to this user, and be approved.
    const sku = await this.prisma.sku.findUnique({
      where: { id: dto.skuId },
      include: { institution: true },
    });
    if (!sku) throw new NotFoundException('SKU not found');
    if (sku.ownerId !== userId) {
      throw new ForbiddenException('Not your SKU');
    }
    if (sku.status !== 'approved') {
      throw new BadRequestException(
        'You can only request batches for approved SKUs',
      );
    }

    const productionDate = new Date(dto.productionDate);
    const expiryDate = new Date(dto.expiryDate);
    if (Number.isNaN(productionDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    if (expiryDate.getTime() <= productionDate.getTime()) {
      throw new BadRequestException('Expiry date must be after production date');
    }
    // Allow production dates up to 30 days in the future (planned production runs)
    const maxFuture = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (productionDate.getTime() > maxFuture) {
      throw new BadRequestException(
        'Production date cannot be more than 30 days in the future',
      );
    }

    let code = newBatchCode();
    for (let i = 0; await this.prisma.batch.findUnique({ where: { code } }); i++) {
      code = newBatchCode();
      if (i > 5) throw new BadRequestException('Could not generate batch code');
    }

    return this.prisma.batch.create({
      data: {
        code,
        skuId: sku.id,
        institutionId: sku.institutionId,
        ownerId: userId,
        requestedQuantity: dto.requestedQuantity,
        productionDate,
        expiryDate,
        externalRef: dto.externalRef,
        status: 'pending',
      },
      include: { sku: true },
    });
  }

  // ---------------- admin ----------------

  async adminList(filter?: { status?: Batch['status'] }) {
    return this.prisma.batch.findMany({
      where: filter?.status ? { status: filter.status } : undefined,
      orderBy: { submittedAt: 'desc' },
      include: {
        sku: true,
        institution: true,
        owner: true,
        reviewedBy: true,
      },
    });
  }

  async adminGetOne(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        sku: true,
        institution: true,
        owner: true,
        reviewedBy: true,
      },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async review(reviewerId: string, id: string, dto: ReviewBatchDto) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: { sku: true, institution: true, owner: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== 'pending') {
      throw new ForbiddenException(
        `Batch is ${batch.status} and cannot be reviewed again`,
      );
    }
    if (dto.decision === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const updated = await this.prisma.batch.update({
      where: { id },
      data: {
        status: dto.decision,
        rejectionReason:
          dto.decision === 'rejected' ? dto.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
      include: { sku: true, institution: true, reviewedBy: true, owner: true },
    });

    try {
      await this.mail.sendBatchDecision({
        to: batch.owner.email,
        fullName: batch.owner.fullName,
        batchCode: batch.code,
        skuName: batch.sku.name,
        quantity: batch.requestedQuantity,
        decision: dto.decision,
        reason: dto.rejectionReason,
      });
    } catch (e) {
      this.logger.error(`Batch decision mail failed: ${(e as Error).message}`);
    }

    return updated;
  }
}
