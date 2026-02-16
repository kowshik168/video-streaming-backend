import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import * as express from 'express';
import { VideosService } from './videos.service';
import { MinioService } from '../minio/minio.service';
import { verifyStreamToken } from './stream-token';

@Controller('videos')
export class VideosStreamController {
  constructor(
    private readonly videosService: VideosService,
    private readonly minioService: MinioService,
  ) {}

  @Get(':id/stream')
  async stream(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: express.Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Missing stream token');
    }
    const parsed = verifyStreamToken(token);
    if (!parsed || parsed.videoId !== id) {
      throw new UnauthorizedException('Invalid or expired stream token');
    }

    const video = await this.videosService.findOne(id);
    if (!video) throw new NotFoundException('Video not found');

    let range: { start: number; end?: number } | undefined;
    if (rangeHeader?.startsWith('bytes=')) {
      const match = rangeHeader.replace('bytes=', '').trim().match(/^(\d+)-(\d*)$/);
      if (match) {
        range = { start: parseInt(match[1], 10), end: match[2] ? parseInt(match[2], 10) : undefined };
      }
    }

    const stat = await this.minioService.getObjectStat(video.video_path);
    const meta = stat.metaData as Record<string, string> | undefined;
    const contentType = meta?.['content-type'] || meta?.['Content-Type'] || 'video/mp4';
    const totalSize = stat.size;

    const stream = await this.minioService.getObjectStream(video.video_path, range);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (range != null) {
      const start = range.start;
      const end = range.end ?? totalSize - 1;
      const contentLength = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', contentLength);
    } else {
      res.setHeader('Content-Length', totalSize);
    }

    stream.pipe(res);
  }
}
