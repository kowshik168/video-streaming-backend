import { Module } from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VideosStreamController } from './videos-stream.controller';
import { MinioModule } from '../minio/minio.module';
@Module({
  imports: [MinioModule],
  controllers: [VideosStreamController, VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
