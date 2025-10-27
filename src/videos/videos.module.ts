import { Module } from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { MinioModule } from '../minio/minio.module';
@Module({
  imports: [MinioModule],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
