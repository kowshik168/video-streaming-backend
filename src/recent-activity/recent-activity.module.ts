import { Module, Global } from '@nestjs/common';
import { RecentActivityService } from './recent-activity.service';

@Global()
@Module({
  providers: [RecentActivityService],
  exports: [RecentActivityService],
})
export class RecentActivityModule {}
