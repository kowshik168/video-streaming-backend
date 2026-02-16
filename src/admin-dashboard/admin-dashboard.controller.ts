import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';
import { SupabaseAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin-dashboard')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('stats')
  async getStats() {
    const raw = await this.dashboard.getStats();
    const storageNum = parseFloat(raw.kpis.storageUsed) || 0;
    return {
      totalUsers: raw.kpis.totalUsers,
      newUsers7d: raw.kpis.newUsersLast7Days,
      totalVideos: raw.kpis.totalVideos,
      totalTopics: raw.kpis.totalTopics,
      totalViews: raw.kpis.totalViews,
      storageUsed: storageNum,
      userGrowth: raw.userGrowthData,
      uploads: raw.uploadsData,
      topicVideos: raw.topicVideoData,
      viewsByDay: raw.viewsData,
      roleDistribution: raw.roleDistribution,
      storageBreakdown: raw.storageBreakdown,
      recentActivity: raw.recentActivity,
      topVideos: raw.topVideos,
    };
  }
}
