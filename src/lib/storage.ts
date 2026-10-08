import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { badRequest } from './errors';
import type { ImageInfo } from './validation';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

type Mime = ImageInfo['mimeType'];
const EXT: Record<Mime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Detects the real type from magic bytes (the browser-supplied type is not trusted). */
export function sniffImage(buf: Buffer): { mimeType: Mime; width: number; height: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return { mimeType: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { mimeType: 'image/jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { mimeType: 'image/jpeg', width: 0, height: 0 };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      return { mimeType: 'image/webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { mimeType: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { mimeType: 'image/webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    return { mimeType: 'image/webp', width: 0, height: 0 };
  }
  return null;
}

const s3Enabled = () => process.env.STORAGE_DRIVER === 's3';

async function s3() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });
}

export async function storeImage(buf: Buffer): Promise<ImageInfo> {
  if (buf.length === 0) throw badRequest('EMPTY_FILE', 'The file is empty.');
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest('FILE_TOO_LARGE', 'Images must be 5 MB or smaller.');
  const info = sniffImage(buf);
  if (!info) throw badRequest('UNSUPPORTED_TYPE', 'Only JPG, PNG and WEBP images are allowed.');

  const key = `images/${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString('hex')}.${EXT[info.mimeType]}`;

  let url: string;
  if (s3Enabled()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3();
    await client.send(
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buf, ContentType: info.mimeType }),
    );
    url = `${(process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`;
  } else {
    const file = path.join(UPLOAD_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buf);
    url = `/uploads/${key}`;
  }
  return { url, key, mimeType: info.mimeType, size: buf.length, width: info.width, height: info.height };
}

export async function deleteStoredImage(key: string) {
  if (!/^images\/[\w-]+\/[a-f0-9]+\.(jpg|png|webp)$/.test(key)) return;
  if (s3Enabled()) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3();
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return;
  }
  await unlink(path.join(UPLOAD_DIR, key));
}
