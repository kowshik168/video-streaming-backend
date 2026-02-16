import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';

export interface DashboardStats {
  kpis: {
    totalUsers: number;
    newUsersLast7Days: number;
    totalVideos: number;
    totalTopics: number;
    totalViews: number;
    storageUsed: string;
  };
  userGrowthData: { month: string; users: number }[];
  uploadsData: { week: string; uploads: number }[];
  topicVideoData: { topic: string; videos: number }[];
  roleDistribution: { name: string; value: number }[];
  viewsData: { day: string; views: number }[];
  storageBreakdown: { name: string; value: number }[];
  recentActivity: { id: string; action: string; user: string; time: string; type: string }[];
  topVideos: { id: string; title: string; views: number; topic: string }[];
}

@Injectable()
export class AdminDashboardService {
  async getStats(): Promise<DashboardStats> {
    const [kpis, userGrowthData, uploadsData, topicVideoData, roleDistribution, recentActivity, topVideos] =
      await Promise.all([
        this.getKpis(),
        this.getUserGrowthData(),
        this.getUploadsData(),
        this.getTopicVideoData(),
        this.getRoleDistribution(),
        this.getRecentActivity(),
        this.getTopVideos(),
      ]);

    return {
      kpis,
      userGrowthData,
      uploadsData,
      topicVideoData,
      roleDistribution,
      viewsData: this.getViewsPlaceholder(),
      storageBreakdown: this.getStoragePlaceholder(),
      recentActivity,
      topVideos,
    };
  }

  private async getKpis(): Promise<DashboardStats['kpis']> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [usersRes, usersLast7Res, videosRes, topicsRes] = await Promise.all([
      supabase.from('Users').select('id', { count: 'exact', head: true }),
      supabase.from('Users').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString()),
      supabase.from('videos').select('id', { count: 'exact', head: true }),
      supabase.from('topics').select('id', { count: 'exact', head: true }),
    ]);

    return {
      totalUsers: usersRes.count ?? 0,
      newUsersLast7Days: usersLast7Res.count ?? 0,
      totalVideos: videosRes.count ?? 0,
      totalTopics: topicsRes.count ?? 0,
      totalViews: 0,
      storageUsed: '0 GB',
    };
  }

  private async getUserGrowthData(): Promise<{ month: string; users: number }[]> {
    const { data: users } = await supabase
      .from('Users')
      .select('created_at')
      .order('created_at', { ascending: true });
    if (!users?.length) return [];

    const byMonth = new Map<string, number>();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const u of users) {
      const d = new Date(u.created_at);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    let cumulative = 0;
    return Array.from(byMonth.entries())
      .sort((a, b) => {
        const [ma, ya] = a[0].split(' ');
        const [mb, yb] = b[0].split(' ');
        const i = monthNames.indexOf(ma);
        const j = monthNames.indexOf(mb);
        if (ya !== yb) return parseInt(ya, 10) - parseInt(yb, 10);
        return i - j;
      })
      .slice(-6)
      .map(([month, count]) => {
        cumulative += count;
        return { month: month.split(' ')[0], users: cumulative };
      });
  }

  private async getUploadsData(): Promise<{ week: string; uploads: number }[]> {
    const { data: videos } = await supabase
      .from('videos')
      .select('created_at')
      .order('created_at', { ascending: true });
    if (!videos?.length) return [];

    const byWeek = new Map<string, number>();
    for (const v of videos) {
      const d = new Date(v.created_at);
      const start = new Date(d);
      start.setDate(start.getDate() - start.getDay());
      const key = start.toISOString().slice(0, 10);
      byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
    }
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-5)
      .map(([, count], i) => ({ week: `W${i + 1}`, uploads: count }));
  }

  private async getTopicVideoData(): Promise<{ topic: string; videos: number }[]> {
    const { data } = await supabase.from('videos').select('topic_id, topics(name)').limit(1000);
    if (!data?.length) return [];

    const byTopic = new Map<string, number>();
    for (const row of data) {
      const t = row.topics as { name: string } | { name: string }[] | null;
      const name = !t ? 'Unknown' : Array.isArray(t) ? t[0]?.name ?? 'Unknown' : t.name;
      byTopic.set(name, (byTopic.get(name) ?? 0) + 1);
    }
    return Array.from(byTopic.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([topic, videos]) => ({ topic, videos }));
  }

  private async getRoleDistribution(): Promise<{ name: string; value: number }[]> {
    const { data } = await supabase.from('Users').select('role');
    if (!data?.length) return [];

    const admin = data.filter((r) => r.role === 'admin').length;
    const user = data.filter((r) => r.role === 'user').length;
    return [
      { name: 'Viewers', value: user },
      { name: 'Admins', value: admin },
    ].filter((r) => r.value > 0);
  }

  private getViewsPlaceholder(): { day: string; views: number }[] {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day) => ({ day, views: 0 }));
  }

  private getStoragePlaceholder(): { name: string; value: number }[] {
    return [
      { name: 'Videos', value: 0 },
      { name: 'Thumbnails', value: 0 },
      { name: 'Backups', value: 0 },
    ];
  }

  private activityTypeToAction(type: string): string {
    const map: Record<string, string> = {
      signup: 'New user registered',
      login: 'User logged in',
      video_created: 'Video uploaded',
      video_updated: 'Video updated',
      video_deleted: 'Video deleted',
      comment_created: 'Comment posted',
      comment_deleted: 'Comment deleted',
      topic_created: 'Topic created',
      topic_updated: 'Topic edited',
      topic_deleted: 'Topic deleted',
    };
    return map[type] ?? type;
  }

  private activityTypeToDisplayType(type: string): string {
    if (type.includes('video')) return 'upload';
    if (type.includes('comment')) return 'comment';
    if (type.includes('topic')) return 'topic';
    if (type === 'login' || type === 'signup') return 'user';
    return 'user';
  }

  private formatTimeAgo(date: Date): string {
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return 'Just now';
    if (sec < 3600) return `${Math.floor(sec / 60)} mins ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} hrs ago`;
    if (sec < 172800) return 'Yesterday';
    if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
    return date.toLocaleDateString();
  }

  private async getRecentActivity(): Promise<DashboardStats['recentActivity']> {
    const { data: activities } = await supabase
      .from('recent_activity')
      .select('id, activity_type, user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    if (!activities?.length) return [];

    const userIds = [...new Set(activities.map((a) => a.user_id))];
    const userMap = new Map<string, string>();

    for (const uid of userIds) {
      const { data: profile } = await supabase
        .from('Users')
        .select('user_name')
        .eq('auth_user_id', uid)
        .maybeSingle();
      userMap.set(uid, profile?.user_name ?? 'User');
    }

    return activities.map((a) => ({
      id: a.id,
      action: this.activityTypeToAction(a.activity_type),
      user: userMap.get(a.user_id) ?? 'User',
      time: this.formatTimeAgo(new Date(a.created_at)),
      type: this.activityTypeToDisplayType(a.activity_type),
    }));
  }

  private async getTopVideos(): Promise<DashboardStats['topVideos']> {
    const { data } = await supabase
      .from('videos')
      .select('id, title, topic_id, topics(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);
    if (!data?.length) return [];

    return data.map((v: { id: string; title: string; topics: { name: string } | { name: string }[] | null }) => {
      const t = v.topics;
      const topicName = !t ? 'Unknown' : Array.isArray(t) ? t[0]?.name ?? 'Unknown' : t.name;
      return { id: v.id, title: v.title, views: 0, topic: topicName };
    });
  }
}
