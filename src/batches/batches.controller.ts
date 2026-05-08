import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/users.service';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/batch.dto';
import { BatchExportService } from '../codes/batch-export.service';
import { CodesService } from '../codes/codes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manufacturer', 'government', 'admin')
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly svc: BatchesService,
    private readonly exporter: BatchExportService,
    private readonly codes: CodesService,
  ) {}

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.svc.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateBatchDto) {
    return this.svc.create(user.id, dto);
  }

  @Get(':id')
  one(@CurrentUser() user: PublicUser, @Param('id') id: string) {
    return this.svc.getOne(user.id, id);
  }

  /**
   * GEN-03 — owner triggers code generation for their approved batch.
   * Cleartext serials returned exactly once in this response (auto-downloaded
   * as CSV by the frontend). The DB persists only `sha256(token)` per code.
   * Tightly throttled because it's the highest-value compute on the platform.
   */
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 6, ttl: 60_000 } })
  @Post(':id/generate')
  async generate(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
  ) {
    // Ownership check (also catches "not found"): throws 403 / 404 before any
    // generation work is done.
    const batch = await this.svc.getOne(user.id, id);
    if (batch.status !== 'approved') {
      throw new ForbiddenException(
        batch.status === 'generated'
          ? 'Codes have already been generated for this batch.'
          : `Batch is ${batch.status}; only approved batches can be generated.`,
      );
    }
    const result = await this.codes.generateForBatch(id);
    return {
      batchId: id,
      count: result.count,
      serials: result.serials,
    };
  }

  // GEN-04 — owner-only print-ready exports. Ownership re-checked via getOne
  // before streaming, so the JWT is the only proof needed.
  @Get(':id/export.csv')
  async exportCsv(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.svc.getOne(user.id, id); // throws 403 if not owner
    return this.exporter.streamCsv(id, res);
  }

  // PDF rendering moved to the client (@react-pdf/renderer). The browser
  // calls /export.json and renders the printable document there. This keeps
  // the API lean and lets the print-ready template evolve without a backend
  // deploy.
  @Get(':id/export.json')
  async exportJson(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
  ) {
    await this.svc.getOne(user.id, id); // ownership check
    return this.exporter.getJson(id);
  }
}
