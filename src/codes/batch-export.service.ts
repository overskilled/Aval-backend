import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { buildToken } from './crypto';

/**
 * GEN-04 — print-ready exports for a generated batch.
 *
 * The DB stores all fields needed to reconstruct each public token
 * (batchId, serialIndex, nonce, keyVersion, signature). The cleartext is
 * therefore re-derivable on demand — no separate ciphertext blob is needed.
 *
 * Two output paths:
 *
 * 1. `streamCsv` — server-side. CSV is small, simple and standard tooling
 *    handles it well; we stream it directly. Format optimised for industrial
 *    label printers + human readability (no crypto internals leaked).
 *
 * 2. `getJson` — server-side reconstruction returned as JSON. The browser
 *    renders the print-ready PDF (via @react-pdf/renderer) so we don't pay
 *    the heavy QR + PDF generation cost on the API.
 */
@Injectable()
export class BatchExportService {
  private readonly logger = new Logger(BatchExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private verifyBaseUrl(): string {
    return this.config.get<string>(
      'VERIFY_BASE_URL',
      this.config.get<string>('CORS_ORIGIN', 'http://localhost:5173').split(',')[0] + '/v',
    );
  }

  private async loadBatchOrThrow(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { sku: true, institution: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== 'generated') {
      throw new ForbiddenException(
        'Batch must be generated before it can be exported',
      );
    }
    return batch;
  }

  private padIndex(i: number, total: number): string {
    const width = String(total - 1).length;
    return String(i + 1).padStart(Math.max(6, width), '0');
  }

  /**
   * Stream the batch as a clean, professional CSV. Columns are flat (one
   * row per code), headers are French, and crypto internals are NOT exposed —
   * the verification URL already encodes everything needed to verify a code.
   *
   * Industrial label software (BarTender, CODESOFT, NiceLabel) reads this
   * format directly with no preprocessing.
   */
  async streamCsv(batchId: string, res: Response): Promise<void> {
    const batch = await this.loadBatchOrThrow(batchId);
    const baseUrl = this.verifyBaseUrl();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${batch.code}-codes.csv"`,
    );

    // BOM so Excel detects UTF-8 (no encoding prompt).
    res.write('﻿');

    const headers = [
      'Index',
      'Identifiant',
      'Lot',
      'Produit',
      'Volume',
      'Date de production',
      'Date d\'expiration',
      'URL de vérification',
    ];
    res.write(headers.join(',') + '\r\n');

    const total = batch.requestedQuantity;
    const productLabel = `${batch.sku.name}`;
    const volumeLabel = `${batch.sku.declaredVolumeMl} mL`;
    const productionDate = batch.productionDate.toISOString().slice(0, 10);
    const expiryDate = batch.expiryDate.toISOString().slice(0, 10);

    const chunkSize = 5_000;
    let cursor: string | undefined = undefined;
    while (true) {
      const rows: any[] = await this.prisma.code.findMany({
        where: { batchId },
        orderBy: { serialIndex: 'asc' },
        take: chunkSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        const token = buildToken({
          b: r.batchId,
          i: r.serialIndex,
          n: r.nonce,
          v: r.keyVersion,
          s: r.signature,
        });
        const url = `${baseUrl}?t=${token}`;
        const padded = this.padIndex(r.serialIndex, total);
        const identifiant = `${batch.code}-${padded}`;
        const cells = [
          r.serialIndex + 1,        // 1-based for human readers
          identifiant,
          batch.code,
          productLabel,
          volumeLabel,
          productionDate,
          expiryDate,
          url,
        ];
        res.write(cells.map(csvEscape).join(',') + '\r\n');
      }
      if (rows.length < chunkSize) break;
      cursor = rows[rows.length - 1].id;
    }
    res.end();
  }

  /**
   * Reconstructs the full set of cleartext serials + batch metadata, returned
   * as JSON. The browser renders the print-ready PDF from this payload.
   *
   * Soft cap on size — extremely large batches (100k codes) would balloon
   * the JSON and stall a single-tab browser; for those, the CSV path is
   * recommended (and printer software ingests CSV anyway).
   */
  async getJson(batchId: string) {
    const batch = await this.loadBatchOrThrow(batchId);
    const baseUrl = this.verifyBaseUrl();
    const total = batch.requestedQuantity;

    const out: {
      index: number;
      identifiant: string;
      url: string;
      token: string;
    }[] = [];

    const chunkSize = 5_000;
    let cursor: string | undefined = undefined;
    while (true) {
      const rows: any[] = await this.prisma.code.findMany({
        where: { batchId },
        orderBy: { serialIndex: 'asc' },
        take: chunkSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        const token = buildToken({
          b: r.batchId,
          i: r.serialIndex,
          n: r.nonce,
          v: r.keyVersion,
          s: r.signature,
        });
        out.push({
          index: r.serialIndex + 1,
          identifiant: `${batch.code}-${this.padIndex(r.serialIndex, total)}`,
          url: `${baseUrl}?t=${token}`,
          token,
        });
      }
      if (rows.length < chunkSize) break;
      cursor = rows[rows.length - 1].id;
    }

    return {
      batch: {
        code: batch.code,
        productionDate: batch.productionDate.toISOString(),
        expiryDate: batch.expiryDate.toISOString(),
        generatedAt: batch.generatedAt?.toISOString() ?? null,
      },
      sku: {
        code: batch.sku.code,
        name: batch.sku.name,
        category: batch.sku.category,
        declaredVolumeMl: batch.sku.declaredVolumeMl,
      },
      institution: {
        legalName: batch.institution.legalName,
      },
      count: out.length,
      codes: out,
    };
  }
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
