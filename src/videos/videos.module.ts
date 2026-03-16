import { Module } from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VideosStreamController } from './videos-stream.controller';
import { MinioModule } from '../minio/minio.module';
import { AiFeaturesModule } from '../ai-features/ai-features.module';
@Module({
  imports: [MinioModule, AiFeaturesModule],
  controllers: [VideosStreamController, VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
