import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { supabase } from '../supabase/supabase.client';
import { RecentActivityService } from '../recent-activity/recent-activity.service';
import { MinioService } from '../minio/minio.service';

const REACTIONS_TABLE = 'video_reactions';

@Injectable()
export class VideosService {
  private table = 'videos';
  private topicsTable = 'topics';

  constructor(
    private readonly recentActivity: RecentActivityService,
    private readonly minioService: MinioService,
  ) {}

  async create(dto: CreateVideoDto, userId: string) {
    const { data, error } = await supabase.from(this.table).insert([dto]).select().single();
    if (error) throw new BadRequestException(error.message);
    await this.recentActivity.log(userId, 'video_created', {
      videoId: data.id,
      topicId: dto.topic_id,
    });
    return data;
  }

  async findAllByTopic(topic_id: string) {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('topic_id', topic_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await supabase.from(this.table).select('*').eq('id', id).single();
    if (error) throw new NotFoundException('Video not found');
    return data;
  }

  /** Get like/dislike counts and current user's reaction for a video. */
  async getReactions(videoId: string, userId?: string) {
    const { data: rows, error } = await supabase
      .from(REACTIONS_TABLE)
      .select('reaction, user_id')
      .eq('video_id', videoId);
    if (error) return { like_count: 0, dislike_count: 0, user_reaction: null as 'like' | 'dislike' | null };
    const list = rows ?? [];
    const like_count = list.filter((r) => r.reaction === 'like').length;
    const dislike_count = list.filter((r) => r.reaction === 'dislike').length;
    let user_reaction: 'like' | 'dislike' | null = null;
    if (userId) {
      const userRow = list.find((r) => r.user_id === userId);
      if (userRow) user_reaction = userRow.reaction as 'like' | 'dislike';
    }
    return { like_count, dislike_count, user_reaction };
  }

  /** Set or clear the current user's reaction (one per user: like or dislike). */
  async setReaction(videoId: string, userId: string, reaction: 'like' | 'dislike') {
    const { error } = await supabase.from(REACTIONS_TABLE).upsert(
      { video_id: videoId, user_id: userId, reaction },
      { onConflict: 'video_id,user_id' },
    );
    if (error) throw new BadRequestException(error.message);
    return this.getReactions(videoId, userId);
  }

  /** Remove the current user's reaction. */
  async removeReaction(videoId: string, userId: string) {
    const { error } = await supabase
      .from(REACTIONS_TABLE)
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return this.getReactions(videoId, userId);
  }

  async update(id: string, dto: UpdateVideoDto, userId: string) {
    const { data, error } = await supabase.from(this.table).update(dto).eq('id', id).select().single();
    if (error) throw new NotFoundException(error.message);
    await this.recentActivity.log(userId, 'video_updated', { videoId: id });
    return data;
  }

  async remove(id: string, userId: string) {
    const video = await this.findOne(id);
    try {
      await this.minioService.deleteFile(video.video_path);
    } catch (err) {
      console.warn('⚠️ MinIO delete failed (file may already be gone):', (err as Error)?.message);
    }
    const { data, error } = await supabase.from(this.table).delete().eq('id', id).select().single();
    if (error) throw new NotFoundException(error.message);
    await this.recentActivity.log(userId, 'video_deleted', { videoId: id });
    return { message: 'Video deleted', video: data };
  }

  /** All videos for a topic (no is_active filter); used when deleting a topic. */
  async findAllByTopicId(topicId: string) {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Find existing topic by name or create a new one, returning its id.
   */
  async findOrCreateTopicByName(name: string, description?: string): Promise<string> {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('Topic name is required');
    }

    // Try to find existing topic
    const { data: existing, error: findError } = await supabase
      .from(this.topicsTable)
      .select('id')
      .eq('name', normalized)
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      throw new BadRequestException(findError.message);
    }
    if (existing?.id) {
      return existing.id;
    }

    // Create new topic
    const { data, error } = await supabase
      .from(this.topicsTable)
      .insert([{ name: normalized, description }])
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }
    return data.id;
  }
}

