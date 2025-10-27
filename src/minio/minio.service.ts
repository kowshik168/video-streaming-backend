import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { minioClient } from './minio.client';
import * as path from 'path';

@Injectable()
export class MinioService {
  // Upload file to MinIO
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

  // Generate a presigned URL for streaming/download
  async getFileUrl(fileName: string, expirySeconds = 60 * 60) {
    try {
      const bucket = process.env.MINIO_BUCKET!;
      return await minioClient.presignedGetObject(bucket, fileName, expirySeconds);
    } catch (error) {
      console.error('❌ Failed to generate presigned URL:', error);
      throw new InternalServerErrorException('Failed to generate presigned URL');
    }
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
