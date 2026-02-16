import * as crypto from 'crypto';

const SECRET = process.env.STREAM_TOKEN_SECRET || process.env.SUPABASE_KEY || 'stream-secret-change-me';
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function signStreamToken(videoId: string): string {
  const expiry = Date.now() + EXPIRY_MS;
  const payload = `${videoId}|${expiry}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest();
  return base64UrlEncode(Buffer.from(payload, 'utf8')) + '.' + base64UrlEncode(sig);
}

export function verifyStreamToken(token: string): { videoId: string } | null {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;
    const payload = base64UrlDecode(payloadB64).toString('utf8');
    const [videoId, expiryStr] = payload.split('|');
    const expiry = Number(expiryStr);
    if (!videoId || !expiry || Number.isNaN(expiry) || expiry < Date.now()) return null;
    const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest();
    const sig = base64UrlDecode(sigB64);
    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) return null;
    return { videoId };
  } catch {
    return null;
  }
}
