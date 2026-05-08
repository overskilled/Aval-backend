import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminTokenGuard } from '../auth/guards/admin-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser, UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { KycService } from '../kyc/kyc.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { ReviewKycDto } from '../kyc/dto/kyc.dto';
import { SkusService } from '../skus/skus.service';
import { ReviewSkuDto } from '../skus/dto/sku.dto';
import { BatchesService } from '../batches/batches.service';
import { ReviewBatchDto } from '../batches/dto/batch.dto';
import { BatchExportService } from '../codes/batch-export.service';
import { Response } from 'express';

class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

/**
 * Admin endpoints — defence in depth:
 *  1. JWT must be valid
 *  2. Authenticated user must have role === 'admin'
 *  3. Request must include shared-secret X-Admin-Token header
 *  4. Every action is audit-logged with actor, action, target, and IP
 */
@UseGuards(JwtAuthGuard, RolesGuard, AdminTokenGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly kyc: KycService,
    private readonly institutions: InstitutionsService,
    private readonly skus: SkusService,
    private readonly batches: BatchesService,
    private readonly exporter: BatchExportService,
  ) {}

  private async log(
    actorId: string,
    action: string,
    target: string | null,
    metadata: Record<string, unknown> | null,
    ip: string | null,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        actorId,
        action,
        target: target ?? undefined,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
        ip: ip ?? undefined,
      },
    });
  }

  @Get('overview')
  async overview(@CurrentUser() actor: PublicUser, @Req() req: any) {
    const [users, workspaces, notes, recentLogins] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.workspace.count(),
      this.prisma.workspaceNote.count(),
      this.prisma.user.findMany({
        where: { lastLoginAt: { not: null } },
        orderBy: { lastLoginAt: 'desc' },
        take: 10,
      }),
    ]);
    await this.log(actor.id, 'admin.overview', null, null, req.ip);
    return {
      counts: { users, workspaces, notes },
      recentLogins: recentLogins.map((u) => this.users.toPublic(u)),
    };
  }

  @Get('users')
  async listUsers(@CurrentUser() actor: PublicUser, @Req() req: any) {
    const users = await this.users.findAll();
    await this.log(actor.id, 'admin.users.list', null, null, req.ip);
    return users.map((u) => this.users.toPublic(u));
  }

  @Patch('users/:id/role')
  async setRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    const updated = await this.users.setRole(id, dto.role);
    await this.log(actor.id, 'admin.users.set_role', id, { role: dto.role }, req.ip);
    return this.users.toPublic(updated);
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    if (id === actor.id) {
      return { error: 'Refusing to delete yourself' };
    }
    await this.users.delete(id);
    await this.log(actor.id, 'admin.users.delete', id, null, req.ip);
    return { ok: true };
  }

  @Get('audit-log')
  async auditLog(@CurrentUser() actor: PublicUser, @Req() req: any) {
    await this.log(actor.id, 'admin.audit.read', null, null, req.ip);
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: true },
    });
  }

  @Get('institutions')
  async institutionsList(@CurrentUser() actor: PublicUser, @Req() req: any) {
    await this.log(actor.id, 'admin.institutions.list', null, null, req.ip);
    return this.institutions.listAll();
  }

  @Get('kyc')
  async kycList(@CurrentUser() actor: PublicUser, @Req() req: any) {
    await this.log(actor.id, 'admin.kyc.list', null, null, req.ip);
    return this.kyc.listAll();
  }

  @Get('kyc/:id')
  async kycOne(
    @Param('id') id: string,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    await this.log(actor.id, 'admin.kyc.read', id, null, req.ip);
    return this.kyc.getOne(id);
  }

  @Patch('kyc/:id')
  async kycReview(
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    const result = await this.kyc.review(actor.id, id, dto);
    await this.log(actor.id, `admin.kyc.${dto.decision}`, id, { ...dto }, req.ip);
    return result;
  }

  @Get('skus')
  async skuList(@CurrentUser() actor: PublicUser, @Req() req: any) {
    await this.log(actor.id, 'admin.skus.list', null, null, req.ip);
    return this.skus.adminList();
  }

  @Get('skus/:id')
  async skuOne(
    @Param('id') id: string,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    await this.log(actor.id, 'admin.skus.read', id, null, req.ip);
    return this.skus.adminGetOne(id);
  }

  @Patch('skus/:id')
  async skuReview(
    @Param('id') id: string,
    @Body() dto: ReviewSkuDto,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    const result = await this.skus.review(actor.id, id, dto);
    await this.log(actor.id, `admin.skus.${dto.decision}`, id, { ...dto }, req.ip);
    return result;
  }

  @Get('batches')
  async batchList(@CurrentUser() actor: PublicUser, @Req() req: any) {
    await this.log(actor.id, 'admin.batches.list', null, null, req.ip);
    return this.batches.adminList();
  }

  @Get('batches/:id')
  async batchOne(
    @Param('id') id: string,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    await this.log(actor.id, 'admin.batches.read', id, null, req.ip);
    return this.batches.adminGetOne(id);
  }

  @Patch('batches/:id')
  async batchReview(
    @Param('id') id: string,
    @Body() dto: ReviewBatchDto,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    const result = await this.batches.review(actor.id, id, dto);
    await this.log(actor.id, `admin.batches.${dto.decision}`, id, { ...dto }, req.ip);
    return result;
  }

  // GEN-03 generation has moved to the manufacturer side (POST /api/batches/:id/generate).
  // The admin's role is to approve/reject batches; the institution that owns the
  // batch is the one that triggers generation (their print run, their codes).

  @Get('batches/:id/export.csv')
  async batchExportCsv(
    @Param('id') id: string,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
    @Res() res: Response,
  ) {
    await this.log(actor.id, 'admin.batches.export.csv', id, null, req.ip);
    return this.exporter.streamCsv(id, res);
  }

  @Get('batches/:id/export.json')
  async batchExportJson(
    @Param('id') id: string,
    @CurrentUser() actor: PublicUser,
    @Req() req: any,
  ) {
    await this.log(actor.id, 'admin.batches.export.json', id, null, req.ip);
    return this.exporter.getJson(id);
  }
}
