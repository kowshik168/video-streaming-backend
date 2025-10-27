import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';

@Injectable()
export class CommentsService {
  async addComment(videoId: string, userId: string, content: string) {
    const { data, error } = await supabase
      .from('comments')
      .insert([{ video_id: videoId, user_id: userId, content }])
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getComments(videoId: string) {
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteComment(id: string, user: any) {
    const { data: existing } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) throw new NotFoundException('Comment not found');
    if (user.role !== 'admin' && user.id !== existing.user_id)
      throw new ForbiddenException('Not allowed');

    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return { message: 'Comment deleted successfully' };
  }
}
