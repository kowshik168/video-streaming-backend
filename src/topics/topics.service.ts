import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { supabase } from '../supabase/supabase.client';

@Injectable()
export class TopicsService {
  private table = 'topics';

  async create(dto: CreateTopicDto) {
    const { name, description } = dto;

    // optional: prevent duplicate names
    const { data: existing } = await supabase.from(this.table).select('id').eq('name', name).single();
    if (existing) throw new BadRequestException('Topic with this name already exists');

    const { data, error } = await supabase.from(this.table).insert([{ name, description }]).select().single();
    if (error) throw new BadRequestException(error.message);
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

  async update(id: string, dto: UpdateTopicDto) {
    const { data, error } = await supabase.from(this.table).update(dto).eq('id', id).select().single();
    if (error) {
      if (error?.code === 'PGRST116') throw new NotFoundException('Topic not found');
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async remove(id: string) {
    const { data, error } = await supabase.from(this.table).delete().eq('id', id).select().single();
    if (error) {
      if (error?.code === 'PGRST116') throw new NotFoundException('Topic not found');
      throw new BadRequestException(error.message);
    }
    return { message: 'Topic deleted', topic: data };
  }
}
