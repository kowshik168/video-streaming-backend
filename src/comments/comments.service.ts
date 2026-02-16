import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { RecentActivityService } from '../recent-activity/recent-activity.service';

@Injectable()
export class CommentsService {
  constructor(private readonly recentActivity: RecentActivityService) {}

  async addComment(videoId: string, userId: string, content: string) {
    const { data, error } = await supabase
      .from('comments')
      .insert([{ video_id: videoId, user_id: userId, content }])
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    await this.recentActivity.log(userId, 'comment_created', {
      videoId,
      commentId: data.id,
    });

    const { data: userRow } = await supabase
      .from('Users')
      .select('user_name')
      .eq('auth_user_id', userId)
      .maybeSingle();
    return { ...data, user_name: userRow?.user_name ?? 'User' };
  }

  async getComments(videoId: string) {
    const { data: comments, error } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    if (!comments?.length) return [];

    const userIds = [...new Set(comments.map((c) => c.user_id))];
    const { data: users } = await supabase
      .from('Users')
      .select('auth_user_id, user_name')
      .in('auth_user_id', userIds);
    const nameByUserId = new Map((users ?? []).map((u) => [u.auth_user_id, u.user_name ?? 'User']));

    return comments.map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      user_id: c.user_id,
      user_name: nameByUserId.get(c.user_id) ?? 'User',
    }));
  }

  async deleteComment(id: string, user: { id: string; role: string }) {
    const { data: existing } = await supabase
      .from('comments')
      .select('user_id, video_id')
      .eq('id', id)
      .single();

    if (!existing) throw new NotFoundException('Comment not found');
    if (user.role !== 'admin' && user.id !== existing.user_id)
      throw new ForbiddenException('Not allowed');

    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await this.recentActivity.log(user.id, 'comment_deleted', {
      videoId: existing.video_id,
      commentId: id,
    });
    return { message: 'Comment deleted successfully' };
  }
}
