import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { supabase } from '../supabase/supabase.client';


@Injectable()
export class VideosService {
  private table = 'videos';

  async create(dto: CreateVideoDto) {
    const { data, error } = await supabase.from(this.table).insert([dto]).select().single();
    if (error) throw new BadRequestException(error.message);
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

  async update(id: string, dto: UpdateVideoDto) {
    const { data, error } = await supabase.from(this.table).update(dto).eq('id', id).select().single();
    if (error) throw new NotFoundException(error.message);
    return data;
  }

  async remove(id: string) {
    const { data, error } = await supabase.from(this.table).delete().eq('id', id).select().single();
    if (error) throw new NotFoundException(error.message);
    return { message: 'Video deleted', video: data };
  }
}
