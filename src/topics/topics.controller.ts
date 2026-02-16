import { Controller, Get, Post, Body, Param, Delete, Put, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { SupabaseAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  @UseGuards(SupabaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateTopicDto, @Req() req: AuthenticatedRequest) {
    return this.topicsService.create(dto, req.user!.id);
  }

  @Get()
  findAll() {
    return this.topicsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.topicsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(SupabaseAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto, @Req() req: AuthenticatedRequest) {
    return this.topicsService.update(id, dto, req.user!.id);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.topicsService.remove(id, req.user!.id);
  }
}
