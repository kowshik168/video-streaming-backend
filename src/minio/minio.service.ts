import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { minioClient, minioPublicUrlBase } from './minio.client';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class MinioService {
  // MINIO_BUCKET is the bucket used for video storage (e.g. "videos"). All uploads and presigned URLs use this bucket.
  // Upload file buffer/stream to MinIO (for multipart uploads from browser)
  async uploadBuffer(buffer: Buffer, fileName: string) {
    try {
      const bucket = process.env.MINIO_BUCKET!;
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) await minioClient.makeBucket(bucket);
      const stream = Readable.from(buffer);
      const etag = await minioClient.putObject(bucket, fileName, stream, buffer.length);
      return { fileName, etag };
    } catch (error) {
      console.error('❌ MinIO buffer upload failed:', error);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  // Upload file to MinIO from filesystem path
  async uploadFile(filePath: string, fileName?: string) {
    try {
      const bucket = process.env.MINIO_BUCKET!;
      fileName = fileName || path.basename(filePath);

      // Ensure bucket exists
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) await minioClient.makeBucket(bucket);

      // Upload file
      const etag = await minioClient.fPutObject(bucket, fileName, filePath);
      return { fileName, etag };
    } catch (error) {
      console.error('❌ MinIO upload failed:', error);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  // Generate presigned URL: use minioClient so we CONNECT to MINIO_ENDPOINT (e.g. minio:9000 in Docker).
  // Then rewrite the URL host to MINIO_PUBLIC_* so the browser gets a reachable URL (e.g. http://127.0.0.1:9000/...).
  async getFileUrl(fileName: string, expirySeconds = 60 * 60) {
    try {
      const bucket = process.env.MINIO_BUCKET!;
      let url = await minioClient.presignedGetObject(bucket, fileName, expirySeconds);
      if (minioPublicUrlBase) {
        const u = new URL(url);
        url = url.replace(u.origin, minioPublicUrlBase);
      }
      return url;
    } catch (error) {
      console.error('❌ Failed to generate presigned URL:', error);
      throw new InternalServerErrorException('Failed to generate presigned URL');
    }
  }

  /** Get a readable stream of the object (for proxying to the browser). */
  async getObjectStream(fileName: string, range?: { start: number; end?: number }) {
    const bucket = process.env.MINIO_BUCKET!;
    if (range != null) {
      return minioClient.getPartialObject(bucket, fileName, range.start, range.end != null ? range.end - range.start + 1 : undefined);
    }
    return minioClient.getObject(bucket, fileName);
  }

  /** Get object metadata (size, content-type) for response headers. */
  async getObjectStat(fileName: string) {
    const bucket = process.env.MINIO_BUCKET!;
    return minioClient.statObject(bucket, fileName);
  }

  // 🧹 Delete file from MinIO (used for rollback if DB insert fails)
  async deleteFile(fileName: string) {
    try {
      const bucket = process.env.MINIO_BUCKET!;
      await minioClient.removeObject(bucket, fileName);
      console.log(`🧹 Deleted file from MinIO: ${fileName}`);
      return true;
    } catch (error) {
      console.error('⚠️ Failed to delete file from MinIO:', error);
      throw new InternalServerErrorException('File deletion failed');
    }
  }
}
