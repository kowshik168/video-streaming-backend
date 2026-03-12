import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { SupabaseAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AiFeaturesService } from './ai-features.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { UpdateQuizStatusDto } from './dto/update-quiz-status.dto';

@Controller('ai')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class AiFeaturesController {
  constructor(private readonly aiFeatures: AiFeaturesService) {}

  @Get('search')
  @Roles('user', 'admin')
  async semanticSearch(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('threshold') threshold?: string,
  ) {
    const query = (q ?? '').trim();
    if (!query) {
      return [];
    }
    const parsedLimit = limit ? Number(limit) : 10;
    const parsedThreshold = threshold ? Number(threshold) : 0.6;
    return this.aiFeatures.semanticSearch(query, parsedLimit, parsedThreshold);
  }

  @Get('videos/:videoId/status')
  @Roles('admin')
  async getProcessingStatus(@Param('videoId') videoId: string) {
    return this.aiFeatures.getProcessingStatus(videoId);
  }

  @Get('videos/:videoId/transcript')
  @Roles('user', 'admin')
  async getTranscript(@Param('videoId') videoId: string) {
    return this.aiFeatures.getTranscript(videoId);
  }

  @Get('videos/:videoId/chapters')
  @Roles('user', 'admin')
  async getChapters(@Param('videoId') videoId: string) {
    return this.aiFeatures.getChapters(videoId);
  }

  @Get('videos/:videoId/quizzes')
  @Roles('admin')
  async getAllQuizzes(
    @Param('videoId') videoId: string,
    @Query('status') status?: 'draft' | 'published',
  ) {
    return this.aiFeatures.getQuizzes(videoId, status);
  }

  @Get('videos/:videoId/quizzes/published')
  @Roles('user', 'admin')
  async getPublishedQuizzes(@Param('videoId') videoId: string) {
    const quizzes = await this.aiFeatures.getQuizzes(videoId, 'published');
    return quizzes.map((quiz) => ({
      ...quiz,
      correct_option_index: undefined,
    }));
  }

  @Patch('quizzes/:quizId/status')
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async setQuizStatus(
    @Param('quizId') quizId: string,
    @Body() body: UpdateQuizStatusDto,
  ) {
    return this.aiFeatures.setQuizStatus(quizId, body.status);
  }

  @Post('videos/:videoId/quizzes/submit')
  @Roles('user', 'admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async submitQuiz(
    @Param('videoId') videoId: string,
    @Body() body: SubmitQuizDto,
  ) {
    return this.aiFeatures.gradeQuiz(videoId, body.answers);
  }

  @Post('videos/:videoId/reprocess')
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async reprocessLecture(
    @Param('videoId') videoId: string,
    @Query('objectName') objectName?: string,
  ) {
    const object = (objectName ?? '').trim();
    if (!object) {
      return { message: 'Pass objectName query param with MinIO object key' };
    }
    await this.aiFeatures.enqueueProcessing(videoId, object);
    return { message: 'AI processing queued', videoId };
  }
}
