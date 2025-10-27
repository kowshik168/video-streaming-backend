import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { SupabaseAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { BadRequestException } from '@nestjs/common';
import { MinioService } from '../minio/minio.service';
import type { Express } from 'express';

@Controller('videos')
@UseGuards(SupabaseAuthGuard)
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly minioService: MinioService,
  ) {}

// Upload video directly from HDD and store metadata
@Post('upload')
async uploadVideoFromHDD(@Body() dto: CreateVideoDto) {
  const path = require('path');
  const fs = require('fs');

  // Validate file exists
  if (!fs.existsSync(dto.video_path)) {
    throw new BadRequestException(`File not found at path: ${dto.video_path}`);
  }

  const fileName = path.basename(dto.video_path);

  try {
    // Step 1️⃣: Upload to MinIO
    const { etag } = await this.minioService.uploadFile(dto.video_path, fileName);

    // Step 2️⃣: Try inserting metadata in Supabase
    const videoDto = {
      ...dto,
      video_path: fileName, // store MinIO file name, not full path
      is_active: dto.is_active ?? true,
    };

    const videoRecord = await this.videosService.create(videoDto);

    // Step 3️⃣: Success
    return {
      message: '✅ Uploaded successfully and metadata stored',
      fileName,
      etag,
      videoRecord,
    };

  } catch (err) {
    console.error('❌ Upload or DB operation failed:', err.message);

    // Step 4️⃣: Rollback — delete uploaded file if exists
    try {
      await this.minioService.deleteFile(path.basename(dto.video_path));
      console.log('🧹 Cleaned up file from MinIO due to DB failure');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup failed (file may remain in MinIO):', cleanupErr.message);
    }

    throw new BadRequestException(`Upload failed: ${err.message}`);
  }
}

  // Create a new video (admin only)
  @Post()
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateVideoDto) {
    return this.videosService.create(dto);
  }

  // Update video details (admin only)
  @Put(':id')
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.videosService.update(id, dto);
  }

  // Delete video (admin only)
  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.videosService.remove(id);
  }

  // Get all videos for a topic (both users & admins)
  @Get('topic/:topicId')
  @Roles('user', 'admin')
  findAllByTopic(@Param('topicId') topicId: string) {
    return this.videosService.findAllByTopic(topicId);
  }

  // Get video details by ID (both users & admins)
  @Get(':id')
  @Roles('user', 'admin')
  async findOne(@Param('id') id: string) {
    const video = await this.videosService.findOne(id);
    if (!video) return null;

    // Add presigned URL for streaming
    const url = await this.minioService.getFileUrl(video.file_name);
    return { ...video, url };
  }
}
