import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TopicsModule } from './topics/topics.module';
import { VideosModule } from './videos/videos.module';
import { CommentsModule } from './comments/comments.module';
import { MinioModule } from './minio/minio.module';
import { RecentActivityModule } from './recent-activity/recent-activity.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { AiFeaturesModule } from './ai-features/ai-features.module';
import * as dotenv from 'dotenv';
dotenv.config();

@Module({
  imports: [
    RecentActivityModule,
    AuthModule,
    TopicsModule,
    VideosModule,
    CommentsModule,
    MinioModule,
    AdminDashboardModule,
    AiFeaturesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
