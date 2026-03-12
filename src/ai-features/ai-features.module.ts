import { Module } from '@nestjs/common';
import { MinioModule } from '../minio/minio.module';
import { AiFeaturesController } from './ai-features.controller';
import { AiFeaturesService } from './ai-features.service';

@Module({
  imports: [MinioModule],
  controllers: [AiFeaturesController],
  providers: [AiFeaturesService],
  exports: [AiFeaturesService],
})
export class AiFeaturesModule {}
