import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TopicsModule } from './topics/topics.module';
import { VideosModule } from './videos/videos.module';
import { CommentsModule } from './comments/comments.module';
import { MinioModule } from './minio/minio.module';
import * as dotenv from 'dotenv';
import { Min } from 'class-validator';
dotenv.config();

@Module({
  imports: [AuthModule, TopicsModule, VideosModule, CommentsModule,MinioModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
