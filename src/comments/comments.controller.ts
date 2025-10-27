import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import {  SupabaseAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('comments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // Add comment
  @Post(':videoId')
  @Roles('user', 'admin')
  async addComment(
    @Param('videoId') videoId: string,
    @Body('content') content: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.commentsService.addComment(videoId, req.user!.id, content);
  }

  // Fetch comments (no guard needed here if you want open access)
  @Get(':videoId')
  async getComments(@Param('videoId') videoId: string) {
    return this.commentsService.getComments(videoId);
  }

  // Delete comment (admin or owner)
  @Delete(':id')
  @Roles('user', 'admin')
  async deleteComment(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.commentsService.deleteComment(id, req.user!);
  }
}
