import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildToken,
  hashToken,
  makeNonce,
  newSecret,
  signSerial,
} from './crypto';

const INSERT_CHUNK = 5_000;
const TX_TIMEOUT_MS = 10 * 60 * 1000;

export interface GeneratedSerial {
  index: number;
  token: string;
  url: string;
}

@Injectable()
export class CodesService {
  private readonly logger = new Logger(CodesService.name);

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

  /** Returns the active signing key for the institution; lazily creates one. */
  private async ensureActiveSigningKey(institutionId: string) {
    const existing = await this.prisma.signingKey.findFirst({
      where: { institutionId, active: true },
      orderBy: { version: 'desc' },
    });
    if (existing) return existing;
    return this.prisma.signingKey.create({
      data: {
        institutionId,
        version: 1,
        secretHex: newSecret(),
        active: true,
      },
    });
  }

  /**
   * Atomically generate signed serials for an approved batch.
   * - Loads / creates the per-manufacturer signing key.
   * - Signs each serial with HMAC-SHA256.
   * - Stores SHA-256(token) in DB; cleartext returned only in this response.
   * - Wraps the entire generation in a single transaction so the batch is
   *   either fully generated or untouched.
   */
  async generateForBatch(batchId: string): Promise<{
    count: number;
    serials: GeneratedSerial[];
  }> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { sku: true, institution: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status === 'generated') {
      throw new ForbiddenException('Batch has already been generated');
    }
    if (batch.status !== 'approved') {
      throw new ForbiddenException(
        'Only approved batches can have codes generated',
      );
    }

    const key = await this.ensureActiveSigningKey(batch.institutionId);
    const baseUrl = this.verifyBaseUrl();

    // Build serials in memory.
    const total = batch.requestedQuantity;
    if (total < 1) throw new BadRequestException('Batch quantity is invalid');
    if (total > 200_000) {
      // Defensive guard: backlog cap is 100k but the schema would technically allow more.
      throw new BadRequestException(
        'Refusing to generate a batch larger than 200,000 codes in one go',
      );
    }

    type Row = {
      serialHash: string;
      signature: string;
      nonce: string;
      serialIndex: number;
      keyVersion: number;
      batchId: string;
      institutionId: string;
      skuId: string;
    };
    const rows: Row[] = new Array(total);
    const serials: GeneratedSerial[] = new Array(total);
    const seenHashes = new Set<string>();

    for (let i = 0; i < total; i++) {
      // Loop in case of (extremely unlikely) hash collision in this batch.
      // We retry with a new nonce.
      let nonce: string;
      let token: string;
      let serialHash: string;
      let signature: string;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        nonce = makeNonce();
        signature = signSerial({
          secretHex: key.secretHex,
          batchId: batch.id,
          serialIndex: i,
          nonce,
        });
        token = buildToken({
          b: batch.id,
          i,
          n: nonce,
          v: key.version,
          s: signature,
        });
        serialHash = hashToken(token);
        if (!seenHashes.has(serialHash)) {
          seenHashes.add(serialHash);
          break;
        }
      }
      rows[i] = {
        serialHash,
        signature,
        nonce,
        serialIndex: i,
        keyVersion: key.version,
        batchId: batch.id,
        institutionId: batch.institutionId,
        skuId: batch.skuId,
      };
      serials[i] = {
        index: i,
        token,
        url: `${baseUrl}?t=${token}`,
      };
    }

    // Persist atomically: chunked createMany inside one interactive transaction.
    await this.prisma.$transaction(
      async (tx) => {
        for (let off = 0; off < rows.length; off += INSERT_CHUNK) {
          const chunk = rows.slice(off, off + INSERT_CHUNK);
          await tx.code.createMany({ data: chunk });
        }
        await tx.batch.update({
          where: { id: batch.id },
          data: { status: 'generated', generatedAt: new Date() },
        });
      },
      { timeout: TX_TIMEOUT_MS, maxWait: 60_000 },
    );

    this.logger.log(
      `Generated ${total} codes for batch ${batch.code} (institution=${batch.institutionId}, keyVersion=${key.version})`,
    );

    return { count: total, serials };
  }

  /** Public-ish: count codes for a batch (used by UI summary). */
  async countForBatch(batchId: string) {
    return this.prisma.code.count({ where: { batchId } });
  }
}
