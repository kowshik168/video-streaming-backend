import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { CreateVideoWithTopicDto } from './dto/create-video-with-topic.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { SupabaseAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MinioService } from '../minio/minio.service';
import { signStreamToken } from './stream-token';
import type { AuthenticatedRequest } from '../auth/types';

const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3000';

@Controller('videos')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly minioService: MinioService,
  ) {}

@Get('stream/:id')
async streamVideo(@Param('id') id: string) {
  // Step 1: Fetch video metadata from Supabase
  const video = await this.videosService.findOne(id);
  if (!video) throw new NotFoundException('Video not found');

  // Step 2: Generate presigned URL from MinIO
  const url = await this.minioService.getFileUrl(video.video_path);

  return {
    message: 'Presigned URL generated successfully',
    video_title: video.title,
    stream_url: url,
    expires_in: '1 hour',
  };
  }
// One-shot upload: ensure topic exists (by name) and upload video + metadata (admin only)
@Post('upload')
@Roles('admin')
async uploadVideoFromHDD(@Body() dto: CreateVideoWithTopicDto, @Req() req: AuthenticatedRequest) {
  const path = require('path');
  const fs = require('fs');

  // Validate file exists
  if (!fs.existsSync(dto.video_path)) {
    throw new BadRequestException(`File not found at path: ${dto.video_path}`);
  }

  const fileName = path.basename(dto.video_path);

  try {
    // Resolve or create topic by name
    const topicId = await this.videosService.findOrCreateTopicByName(
      dto.topic_name,
      dto.topic_description,
    );

    // Step 1️⃣: Upload to MinIO
    const { etag } = await this.minioService.uploadFile(dto.video_path, fileName);

    // Step 2️⃣: Try inserting metadata in Supabase
    const videoDto: CreateVideoDto = {
      topic_id: topicId,
      title: dto.title,
      description: dto.description,
      video_path: fileName, // store MinIO file name, not full path
      is_active: dto.is_active ?? true,
      tryout_link: dto.tryout_link,
    };

    const videoRecord = await this.videosService.create(videoDto, req.user!.id);

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

  // Multipart upload: browser file + metadata (admin only)
  @Post('upload-file')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideoMultipart(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { topic_id: string; title: string; description?: string; tryout_link?: string; is_active?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Video file is required');
    }
    if (!file.mimetype.startsWith('video/')) {
      throw new BadRequestException('File must be a video');
    }
    if (!body.topic_id?.trim()) {
      throw new BadRequestException('Topic is required');
    }
    if (!body.title?.trim()) {
      throw new BadRequestException('Title is required');
    }

    const fileName = `${Date.now()}-${file.originalname}`.replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      const { etag } = await this.minioService.uploadBuffer(file.buffer, fileName);

      const videoDto: CreateVideoDto = {
        topic_id: body.topic_id.trim(),
        title: body.title.trim(),
        description: body.description?.trim() || undefined,
        video_path: fileName,
        is_active: body.is_active !== 'false',
        tryout_link: body.tryout_link?.trim() || undefined,
      };

      const videoRecord = await this.videosService.create(videoDto, req.user!.id);

      return {
        message: '✅ Uploaded successfully and metadata stored',
        fileName,
        etag,
        videoRecord,
      };
    } catch (err) {
      console.error('❌ Upload or DB operation failed:', err.message);
      try {
        await this.minioService.deleteFile(fileName);
      } catch (cleanupErr) {
        console.error('⚠️ Cleanup failed:', cleanupErr);
      }
      throw new BadRequestException(`Upload failed: ${err.message}`);
    }
  }

  // Create a new video (admin only)
  @Post()
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateVideoDto, @Req() req: AuthenticatedRequest) {
    return this.videosService.create(dto, req.user!.id);
  }

  // Update video details (admin only)
  @Put(':id')
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: UpdateVideoDto, @Req() req: AuthenticatedRequest) {
    return this.videosService.update(id, dto, req.user!.id);
  }

  // Delete video (admin only)
  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.videosService.remove(id, req.user!.id);
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
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const video = await this.videosService.findOne(id);
    if (!video) return null;

    const reactions = await this.videosService.getReactions(id, req.user?.id);

    // Stream via backend proxy (avoids MinIO signature/host issues). Browser gets URL with short-lived token.
    const token = signStreamToken(id);
    const url = `${PUBLIC_API_URL.replace(/\/$/, '')}/videos/${id}/stream?token=${encodeURIComponent(token)}`;
    return { ...video, url, ...reactions };
  }

  // Set like or dislike (one per user; toggles or switches)
  @Post(':id/reaction')
  @Roles('user', 'admin')
  async setReaction(
    @Param('id') id: string,
    @Body('reaction') reaction: 'like' | 'dislike',
    @Req() req: AuthenticatedRequest,
  ) {
    const video = await this.videosService.findOne(id);
    if (!video) throw new NotFoundException('Video not found');
    if (reaction !== 'like' && reaction !== 'dislike') {
      throw new BadRequestException('reaction must be "like" or "dislike"');
    }
    return this.videosService.setReaction(id, req.user!.id, reaction);
  }

  // Remove like/dislike
  @Delete(':id/reaction')
  @Roles('user', 'admin')
  async removeReaction(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const video = await this.videosService.findOne(id);
    if (!video) throw new NotFoundException('Video not found');
    return this.videosService.removeReaction(id, req.user!.id);
  }
}
