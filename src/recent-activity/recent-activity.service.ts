import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';

export type ActivityType =
  | 'video_created'
  | 'video_updated'
  | 'video_deleted'
  | 'comment_created'
  | 'comment_deleted'
  | 'topic_created'
  | 'topic_updated'
  | 'topic_deleted'
  | 'login'
  | 'signup';

export interface LogActivityOptions {
  videoId?: string;
  commentId?: string;
  topicId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class RecentActivityService {
  private table = 'recent_activity';

  async log(
    userId: string,
    activityType: ActivityType,
    options: LogActivityOptions = {},
  ): Promise<void> {
    const { videoId, commentId, topicId, metadata } = options;
    const { error } = await supabase.from(this.table).insert([
      {
        user_id: userId,
        activity_type: activityType,
        ...(videoId && { video_id: videoId }),
        ...(commentId && { comment_id: commentId }),
        ...(topicId && { topic_id: topicId }),
        ...(metadata && { metadata }),
      },
    ]);
    if (error) {
      console.error('[RecentActivityService] Failed to log:', error.message);
      // Don't throw – activity logging should not break the main flow
    }
  }
}
