import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { supabase } from '../supabase/supabase.client';
import { RecentActivityService } from '../recent-activity/recent-activity.service';
import { VideosService } from '../videos/videos.service';

@Injectable()
export class TopicsService {
  private table = 'topics';

  constructor(
    private readonly recentActivity: RecentActivityService,
    private readonly videosService: VideosService,
  ) {}

  async create(dto: CreateTopicDto, userId: string) {
    const { name, description } = dto;

    // optional: prevent duplicate names
    const { data: existing } = await supabase.from(this.table).select('id').eq('name', name).single();
    if (existing) throw new BadRequestException('Topic with this name already exists');

    const { data, error } = await supabase.from(this.table).insert([{ name, description }]).select().single();
    if (error) throw new BadRequestException(error.message);
    await this.recentActivity.log(userId, 'topic_created', { topicId: data.id });
    return data;
  }

  async findAll() {
    const { data, error } = await supabase.from(this.table).select('*').order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await supabase.from(this.table).select('*').eq('id', id).single();
    if (error) {
      // Supabase returns a PGRST error when not found — translate it
      if (error?.code === 'PGRST116') throw new NotFoundException('Topic not found');
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async update(id: string, dto: UpdateTopicDto, userId: string) {
    const { data, error } = await supabase.from(this.table).update(dto).eq('id', id).select().single();
    if (error) {
      if (error?.code === 'PGRST116') throw new NotFoundException('Topic not found');
      throw new BadRequestException(error.message);
    }
    await this.recentActivity.log(userId, 'topic_updated', { topicId: id });
    return data;
  }

  async remove(id: string, userId: string) {
    // Verify topic exists before logging (log inserts topic_id FK)
    const { error: fetchError } = await supabase.from(this.table).select('id').eq('id', id).single();
    if (fetchError?.code === 'PGRST116') throw new NotFoundException('Topic not found');
    if (fetchError) throw new BadRequestException(fetchError.message);

    // Log BEFORE delete – recent_activity.topic_id FK would fail if we log after (topic gone)
    await this.recentActivity.log(userId, 'topic_deleted', { topicId: id });

    // Delete all videos in this topic (MinIO + DB) before deleting the topic
    const videos = await this.videosService.findAllByTopicId(id);
    for (const video of videos) {
      try {
        await this.videosService.remove(video.id, userId);
      } catch (err) {
        console.warn(`⚠️ Failed to delete video ${video.id} when deleting topic:`, (err as Error)?.message);
      }
    }

    const { data, error } = await supabase.from(this.table).delete().eq('id', id).select().single();
    if (error) {
      if (error?.code === 'PGRST116') throw new NotFoundException('Topic not found');
      throw new BadRequestException(error.message);
    }
    return { message: 'Topic deleted', topic: data };
  }
}
