import * as crypto from 'crypto';

/**
 * Token format embedded in the QR payload (the "serial" on the bottle).
 *
 * The token is base64url(JSON.stringify({
 *   b: batchId,            // string
 *   i: serialIndex,        // number
 *   n: nonce,              // hex string (16 chars = 8 bytes random)
 *   v: keyVersion,         // number
 *   s: signatureHex,       // HMAC-SHA256(secret, `${b}:${i}:${n}`) hex
 * }))
 *
 * The DB stores only `sha256(token)` so a database compromise reveals no
 * issued codes. The cleartext token is returned exactly once in the
 * generation response (and downloadable as CSV).
 */
export interface SerialPayload {
  b: string;
  i: number;
  n: string;
  v: number;
  s: string;
}

const PAYLOAD_SEPARATOR = ':';

export function makeNonce(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function signSerial(args: {
  secretHex: string;
  batchId: string;
  serialIndex: number;
  nonce: string;
}): string {
  const message = `${args.batchId}${PAYLOAD_SEPARATOR}${args.serialIndex}${PAYLOAD_SEPARATOR}${args.nonce}`;
  return crypto
    .createHmac('sha256', Buffer.from(args.secretHex, 'hex'))
    .update(message)
    .digest('hex');
}

export function buildToken(p: SerialPayload): string {
  return Buffer.from(JSON.stringify(p)).toString('base64url');
}

export function parseToken(token: string): SerialPayload | null {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed.b !== 'string' ||
      typeof parsed.i !== 'number' ||
      typeof parsed.n !== 'string' ||
      typeof parsed.v !== 'number' ||
      typeof parsed.s !== 'string'
    ) {
      return null;
    }
    return parsed as SerialPayload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time signature comparison. */
export function verifySignature(args: {
  secretHex: string;
  batchId: string;
  serialIndex: number;
  nonce: string;
  signatureHex: string;
}): boolean {
  const expected = signSerial(args);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(args.signatureHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function newSecret(): string {
  return crypto.randomBytes(32).toString('hex'); // 256-bit secret
}
