import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { MinioService } from '../minio/minio.service';
import { supabase } from '../supabase/supabase.client';

type WhisperSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type ChapterDraft = {
  title: string;
  summary: string;
  start_seconds: number;
  end_seconds: number | null;
};

type QuizDraft = {
  question: string;
  options: string[];
  correct_option_index: number;
  explanation?: string;
};

@Injectable()
export class AiFeaturesService {
  private readonly openai: OpenAI;

  constructor(private readonly minioService: MinioService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for AI features.');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async enqueueProcessing(videoId: string, objectName: string) {
    await this.updateJob(videoId, 'queued');
    void this.processVideo(videoId, objectName);
  }

  async processVideo(videoId: string, objectName: string) {
    try {
      await this.updateJob(videoId, 'processing', null, true);
      const fileBuffer = await this.readObjectAsBuffer(objectName);
      const transcription = await this.transcribe(fileBuffer, objectName);

      const segments = this.normalizeSegments(transcription.segments ?? []);
      const fullText = (transcription.text ?? '').trim();
      if (!fullText) {
        throw new BadRequestException('Transcription returned empty text');
      }

      const transcriptId = await this.replaceTranscript(videoId, {
        language: transcription.language ?? null,
        duration_seconds: transcription.duration ?? null,
        full_text: fullText,
        raw_json: transcription,
      });

      await this.replaceSegments(videoId, transcriptId, segments);
      const chapters = await this.generateChapters(fullText, segments);
      await this.replaceChapters(videoId, chapters);

      const quizzes = await this.generateQuiz(fullText);
      await this.replaceQuizDrafts(videoId, quizzes);

      await this.updateJob(videoId, 'completed');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      await this.updateJob(videoId, 'failed', message);
      throw error;
    }
  }

  async getProcessingStatus(videoId: string) {
    const { data, error } = await supabase
      .from('ai_processing_jobs')
      .select('*')
      .eq('video_id', videoId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ?? { video_id: videoId, status: 'not_started' };
  }

  async semanticSearch(query: string, limit = 10, threshold = 0.6) {
    const queryEmbedding = await this.embedText(query);
    const { data, error } = await supabase.rpc('search_transcript_segments', {
      query_embedding: this.toVectorLiteral(queryEmbedding),
      match_count: limit,
      similarity_threshold: threshold,
    });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async getTranscript(videoId: string) {
    const { data, error } = await supabase
      .from('lecture_transcripts')
      .select('id, video_id, language, duration_seconds, full_text, created_at')
      .eq('video_id', videoId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) return null;

    const { data: segments, error: segError } = await supabase
      .from('transcript_segments')
      .select('id, segment_index, start_seconds, end_seconds, content')
      .eq('video_id', videoId)
      .order('segment_index', { ascending: true });
    if (segError) throw new BadRequestException(segError.message);

    return { ...data, segments: segments ?? [] };
  }

  async getChapters(videoId: string) {
    const { data, error } = await supabase
      .from('lecture_chapters')
      .select('id, chapter_index, title, summary, start_seconds, end_seconds')
      .eq('video_id', videoId)
      .order('chapter_index', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async getQuizzes(videoId: string, status?: 'draft' | 'published') {
    let query = supabase
      .from('lecture_quizzes')
      .select(
        'id, question, options, status, explanation, created_at, correct_option_index',
      )
      .eq('video_id', videoId)
      .order('created_at', { ascending: true });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async setQuizStatus(quizId: string, status: 'draft' | 'published') {
    const { data, error } = await supabase
      .from('lecture_quizzes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', quizId)
      .select('id, status')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async gradeQuiz(
    videoId: string,
    answers: { quiz_id: string; selected_option_index: number }[],
  ) {
    if (!answers.length) {
      throw new BadRequestException('At least one answer is required');
    }

    const quizIds = answers.map((a) => a.quiz_id);
    const { data: quizzes, error } = await supabase
      .from('lecture_quizzes')
      .select(
        'id, question, options, correct_option_index, explanation, status',
      )
      .eq('video_id', videoId)
      .eq('status', 'published')
      .in('id', quizIds);
    if (error) throw new BadRequestException(error.message);

    const byId = new Map((quizzes ?? []).map((q) => [q.id, q]));
    let correct = 0;
    const results = answers
      .map((answer) => {
        const quiz = byId.get(answer.quiz_id);
        if (!quiz) return null;
        const isCorrect =
          quiz.correct_option_index === answer.selected_option_index;
        if (isCorrect) correct += 1;
        return {
          quiz_id: quiz.id,
          question: quiz.question,
          selected_option_index: answer.selected_option_index,
          correct_option_index: quiz.correct_option_index,
          is_correct: isCorrect,
          explanation: quiz.explanation ?? null,
        };
      })
      .filter((row) => row !== null);

    const total = results.length;
    return {
      total,
      correct,
      score_percent: total === 0 ? 0 : Math.round((correct / total) * 100),
      results,
    };
  }

  private async updateJob(
    videoId: string,
    status: 'queued' | 'processing' | 'completed' | 'failed',
    errorMessage?: string | null,
    setStartedAt = false,
  ) {
    const payload: Record<string, unknown> = {
      video_id: videoId,
      status,
      updated_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
    };
    if (setStartedAt) payload.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'failed') {
      payload.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('ai_processing_jobs')
      .upsert(payload, {
        onConflict: 'video_id',
      });
    if (error) throw new InternalServerErrorException(error.message);
  }

  private async readObjectAsBuffer(objectName: string): Promise<Buffer> {
    const stream = await this.minioService.getObjectStream(objectName);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  private async transcribe(fileBuffer: Buffer, fileName: string) {
    const fileBytes = new Uint8Array(fileBuffer);
    const file = new File([fileBytes], fileName, { type: 'video/mp4' });
    const transcription = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
    return transcription as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: WhisperSegment[];
      [key: string]: unknown;
    };
  }

  private normalizeSegments(segments: WhisperSegment[]) {
    return segments
      .map((segment, idx) => ({
        segment_index: idx,
        start_seconds: Number(segment.start ?? 0),
        end_seconds: Number(segment.end ?? segment.start ?? 0),
        content: (segment.text ?? '').trim(),
      }))
      .filter((segment) => segment.content.length > 0);
  }

  private async replaceTranscript(
    videoId: string,
    payload: {
      language: string | null;
      duration_seconds: number | null;
      full_text: string;
      raw_json: unknown;
    },
  ) {
    await supabase.from('lecture_transcripts').delete().eq('video_id', videoId);
    const { data, error } = await supabase
      .from('lecture_transcripts')
      .insert({
        video_id: videoId,
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data.id as string;
  }

  private async replaceSegments(
    videoId: string,
    transcriptId: string,
    segments: Array<{
      segment_index: number;
      start_seconds: number;
      end_seconds: number;
      content: string;
    }>,
  ) {
    await supabase.from('transcript_segments').delete().eq('video_id', videoId);
    if (!segments.length) return;

    const embeddings = await this.embedBatch(
      segments.map((segment) => segment.content),
    );
    const rows = segments.map((segment, idx) => ({
      video_id: videoId,
      transcript_id: transcriptId,
      segment_index: segment.segment_index,
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      content: segment.content,
      embedding: this.toVectorLiteral(embeddings[idx]),
    }));
    const { error } = await supabase.from('transcript_segments').insert(rows);
    if (error) throw new BadRequestException(error.message);
  }

  private async replaceChapters(videoId: string, chapters: ChapterDraft[]) {
    await supabase.from('lecture_chapters').delete().eq('video_id', videoId);
    if (!chapters.length) return;
    const rows = chapters.map((chapter, idx) => ({
      video_id: videoId,
      chapter_index: idx,
      title: chapter.title,
      summary: chapter.summary,
      start_seconds: chapter.start_seconds,
      end_seconds: chapter.end_seconds,
    }));
    const { error } = await supabase.from('lecture_chapters').insert(rows);
    if (error) throw new BadRequestException(error.message);
  }

  private async replaceQuizDrafts(videoId: string, quizzes: QuizDraft[]) {
    await supabase.from('lecture_quizzes').delete().eq('video_id', videoId);
    if (!quizzes.length) return;
    const rows = quizzes.map((quiz) => ({
      video_id: videoId,
      question: quiz.question,
      options: quiz.options,
      correct_option_index: quiz.correct_option_index,
      explanation: quiz.explanation ?? null,
      status: 'draft',
      generated_by_ai: true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('lecture_quizzes').insert(rows);
    if (error) throw new BadRequestException(error.message);
  }

  private async generateChapters(
    fullText: string,
    segments: Array<{
      start_seconds: number;
      end_seconds: number;
      content: string;
    }>,
  ) {
    const prompt = `You are segmenting a lecture into logical chapters.
Return valid JSON only with this shape:
{"chapters":[{"title":"string","summary":"string","start_seconds":0,"end_seconds":123.4}]}

Rules:
- Produce 4 to 8 chapters.
- Chapter titles must be concise.
- Summary should be 1-2 sentences.
- start_seconds and end_seconds must be numeric and increasing.
- Use this transcript text:
${fullText.slice(0, 14000)}

Helpful timestamps:
${segments
  .slice(0, 200)
  .map(
    (segment) =>
      `[${Math.floor(segment.start_seconds)}-${Math.floor(segment.end_seconds)}] ${segment.content}`,
  )
  .join('\n')}`;

    const raw = await this.chatJson(prompt);
    const chaptersRaw = Array.isArray(raw?.chapters) ? raw.chapters : [];
    const parsed = chaptersRaw
      .map((chapter) => ({
        title: String(chapter.title ?? '').trim(),
        summary: String(chapter.summary ?? '').trim(),
        start_seconds: Number(chapter.start_seconds ?? 0),
        end_seconds:
          chapter.end_seconds == null ? null : Number(chapter.end_seconds),
      }))
      .filter((chapter) => chapter.title && chapter.summary);
    return parsed.slice(0, 10);
  }

  private async generateQuiz(fullText: string) {
    const prompt = `Create multiple-choice questions from this lecture transcript.
Return valid JSON only with:
{"questions":[{"question":"string","options":["A","B","C","D"],"correct_option_index":0,"explanation":"string"}]}

Rules:
- Create 8 questions.
- 4 options per question.
- correct_option_index must be 0..3.
- Questions should test understanding, not trivial wording.
- Transcript:
${fullText.slice(0, 14000)}`;

    const raw = await this.chatJson(prompt);
    const questionsRaw = Array.isArray(raw?.questions) ? raw.questions : [];
    const quizzes = questionsRaw
      .map((question) => ({
        question: String(question.question ?? '').trim(),
        options: Array.isArray(question.options)
          ? question.options.map((o) => String(o ?? '').trim())
          : [],
        correct_option_index: Number(question.correct_option_index ?? -1),
        explanation: String(question.explanation ?? '').trim(),
      }))
      .filter(
        (question) =>
          question.question.length > 0 && question.options.length === 4,
      )
      .map((question) => ({
        ...question,
        correct_option_index:
          question.correct_option_index >= 0 &&
          question.correct_option_index <= 3
            ? question.correct_option_index
            : 0,
      }));
    return quizzes.slice(0, 12);
  }

  private async chatJson(prompt: string): Promise<Record<string, any>> {
    const completion = await this.openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Return only strict JSON with no markdown fences.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(content) as Record<string, any>;
    } catch {
      return {};
    }
  }

  private async embedText(input: string) {
    const response = await this.openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input,
    });
    const vector = response.data[0]?.embedding;
    if (!vector)
      throw new InternalServerErrorException('Failed to create embedding');
    return vector;
  }

  private async embedBatch(inputs: string[]) {
    const vectors: number[][] = [];
    const batchSize = 50;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const response = await this.openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: batch,
      });
      vectors.push(...response.data.map((d) => d.embedding));
    }
    return vectors;
  }

  private toVectorLiteral(values: number[]) {
    return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
  }
}
