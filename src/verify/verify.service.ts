import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  hashToken,
  parseToken,
  verifySignature,
} from '../codes/crypto';

export type VerifyVerdict = 'AUTHENTIC' | 'SUSPICIOUS' | 'UNKNOWN';

export interface VerifyResponse {
  status: VerifyVerdict;
  reason?:
    | 'malformed_token'
    | 'code_not_found'
    | 'invalid_signature'
    | 'no_signing_key'
    | 'batch_revoked';
  product?: {
    name: string;
    category: string;
    volumeMl: number;
    packaging: string;
  };
  batch?: {
    code: string;
    productionDate: string;
    expiryDate: string;
    isExpired: boolean;
  };
  manufacturer?: {
    name: string;
  };
  serial?: {
    identifiant: string;
  };
}

/**
 * VER-01 / VER-02 — public verification.
 *
 * Flow:
 *   1. Parse the base64url token. Malformed → UNKNOWN.
 *   2. Hash the token (SHA-256). Look up the Code by hash.
 *      Not found → UNKNOWN (most common counterfeit case).
 *   3. Look up the institution's signing key by version.
 *   4. Re-compute HMAC-SHA256 over `${batchId}:${serialIndex}:${nonce}` using
 *      the institution's secret. Constant-time compare with the stored sig.
 *   5. Honor batch revocation (GEN-07): revoked batch → SUSPICIOUS.
 *   6. Otherwise → AUTHENTIC.
 *
 * No PII is leaked in the response — only the public-facing product /
 * manufacturer / batch metadata that's already on the bottle's label.
 */
@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verify(token: string): Promise<VerifyResponse> {
    const payload = parseToken(token);
    if (!payload) {
      return { status: 'UNKNOWN', reason: 'malformed_token' };
    }

    const tokenHash = hashToken(token);
    const code = await this.prisma.code.findUnique({
      where: { serialHash: tokenHash },
      include: {
        batch: { include: { sku: true } },
        institution: true,
      },
    });
    if (!code) {
      return { status: 'UNKNOWN', reason: 'code_not_found' };
    }

    // Sanity checks: payload should match what we stored. (Cheap defense
    // against tampered tokens that happen to collide on hash — astronomically
    // unlikely, but free to verify.)
    if (
      payload.b !== code.batchId ||
      payload.i !== code.serialIndex ||
      payload.n !== code.nonce ||
      payload.v !== code.keyVersion
    ) {
      return { status: 'UNKNOWN', reason: 'invalid_signature' };
    }

    const key = await this.prisma.signingKey.findFirst({
      where: { institutionId: code.institutionId, version: code.keyVersion },
    });
    if (!key) {
      // The institution's key for this version is gone — treat as unverifiable.
      return { status: 'UNKNOWN', reason: 'no_signing_key' };
    }

    const valid = verifySignature({
      secretHex: key.secretHex,
      batchId: payload.b,
      serialIndex: payload.i,
      nonce: payload.n,
      signatureHex: payload.s,
    });
    if (!valid) {
      return { status: 'UNKNOWN', reason: 'invalid_signature' };
    }

    // Batch revocation (GEN-07) — codes from a revoked batch must scan as suspect.
    if (code.batch.status === 'revoked') {
      return {
        status: 'SUSPICIOUS',
        reason: 'batch_revoked',
        product: this.publicProduct(code.batch.sku),
        batch: this.publicBatch(code.batch),
        manufacturer: { name: code.institution.legalName },
        serial: this.publicSerial(code.batch.code, code.serialIndex, code.batch.requestedQuantity),
      };
    }

    return {
      status: 'AUTHENTIC',
      product: this.publicProduct(code.batch.sku),
      batch: this.publicBatch(code.batch),
      manufacturer: { name: code.institution.legalName },
      serial: this.publicSerial(code.batch.code, code.serialIndex, code.batch.requestedQuantity),
    };
  }

  private publicProduct(sku: any) {
    return {
      name: sku.name,
      category: sku.category,
      volumeMl: sku.declaredVolumeMl,
      packaging: sku.packaging,
    };
  }

  private publicBatch(batch: any) {
    const expiry = new Date(batch.expiryDate);
    return {
      code: batch.code,
      productionDate: batch.productionDate.toISOString(),
      expiryDate: batch.expiryDate.toISOString(),
      isExpired: expiry.getTime() < Date.now(),
    };
  }

  private publicSerial(batchCode: string, index: number, total: number) {
    const width = Math.max(6, String(total - 1).length);
    return {
      identifiant: `${batchCode}-${String(index + 1).padStart(width, '0')}`,
    };
  }
}
