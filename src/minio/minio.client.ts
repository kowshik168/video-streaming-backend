import { Client } from 'minio';
import * as dotenv from 'dotenv';
dotenv.config();

// Client for upload/delete (uses internal endpoint, e.g. "minio" in Docker)
export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

// Presigned URLs: we generate with minioClient (connects to MINIO_ENDPOINT, e.g. minio:9000 in Docker).
// The returned URL host is rewritten in MinioService.getFileUrl() to MINIO_PUBLIC_* so the browser can reach MinIO.
export const minioPublicUrlBase = (process.env.MINIO_PUBLIC_ENDPOINT && process.env.MINIO_PUBLIC_ENDPOINT.length > 0)
  ? `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_PUBLIC_ENDPOINT}:${Number(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT) || 9000}`
  : null;
