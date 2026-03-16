import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
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

type AiProvider = 'openai' | 'local';

@Injectable()
export class AiFeaturesService {
  private readonly openai: OpenAI | null;
  private readonly logger = new Logger(AiFeaturesService.name);
  private readonly aiProvider: AiProvider;
  private readonly ollamaUrl: string;
  private readonly localChatModel: string;
  private readonly localEmbeddingModel: string;
  private readonly localWhisperUrl: string;

  constructor(private readonly minioService: MinioService) {
    this.aiProvider =
      (process.env.AI_PROVIDER as AiProvider | undefined) ?? 'local';
    this.ollamaUrl = process.env.OLLAMA_URL ?? 'http://ollama:11434';
    this.localChatModel = process.env.LOCAL_CHAT_MODEL ?? 'llama3.2:3b';
    this.localEmbeddingModel =
      process.env.LOCAL_EMBEDDING_MODEL ?? 'nomic-embed-text';
    this.localWhisperUrl =
      process.env.LOCAL_WHISPER_URL ?? 'http://whisper:9000';

    if (this.aiProvider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY is required when AI_PROVIDER=openai.',
        );
      }
      this.openai = new OpenAI({ apiKey });
      this.logger.log('AI provider: OpenAI');
      return;
    }

    this.openai = null;
    this.logger.log(
      `AI provider: local (ollama=${this.ollamaUrl}, whisper=${this.localWhisperUrl})`,
    );
  }

  async enqueueProcessing(videoId: string, objectName: string) {
    this.logger.log(
      `Queueing AI processing for video=${videoId} object=${objectName}`,
    );
    await this.updateJob(videoId, 'queued');
    void this.processVideo(videoId, objectName).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      this.logger.error(
        `Detached AI processing failed for video=${videoId}: ${message}`,
      );
    });
  }

  async processVideo(videoId: string, objectName: string) {
    try {
      this.logger.log(
        `Starting AI processing for video=${videoId} object=${objectName}`,
      );
      await this.updateJob(videoId, 'processing', null, true);
      const fileBuffer = await this.readObjectAsBuffer(objectName);
      this.logger.log(
        `Downloaded source object for video=${videoId}, bytes=${fileBuffer.byteLength}`,
      );
      const transcription = await this.transcribe(fileBuffer, objectName);

      const segments = this.normalizeSegments(transcription.segments ?? []);
      const fullText = (transcription.text ?? '').trim();
      if (!fullText) {
        throw new BadRequestException('Transcription returned empty text');
      }
      this.logger.log(
        `Transcription completed for video=${videoId}, segments=${segments.length}`,
      );

      const transcriptId = await this.replaceTranscript(videoId, {
        language: transcription.language ?? null,
        duration_seconds: transcription.duration ?? null,
        full_text: fullText,
        raw_json: transcription,
      });

      await this.replaceSegments(videoId, transcriptId, segments);
      const chapters = await this.generateChapters(fullText, segments);
      await this.replaceChapters(videoId, chapters);
      this.logger.log(
        `Chapter generation completed for video=${videoId}, chapters=${chapters.length}`,
      );

      const quizzes = await this.generateQuiz(fullText);
      await this.replaceQuizDrafts(videoId, quizzes);
      this.logger.log(
        `Quiz generation completed for video=${videoId}, quizzes=${quizzes.length}`,
      );

      await this.updateJob(videoId, 'completed');
      this.logger.log(`AI processing completed for video=${videoId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      await this.updateJob(videoId, 'failed', message);
      this.logger.error(
        `AI processing failed for video=${videoId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
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
    if (this.aiProvider === 'local') {
      return this.semanticSearchLocal(query, limit, threshold);
    }
    const queryEmbedding = await this.embedText(query);
    const { data, error } = await supabase.rpc('search_transcript_segments', {
      query_embedding: this.toVectorLiteral(queryEmbedding),
      match_count: limit,
      similarity_threshold: threshold,
    });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async semanticSearchLocal(
    query: string,
    limit: number,
    threshold: number,
  ) {
    const { data: segments, error } = await supabase
      .from('transcript_segments')
      .select('id, video_id, start_seconds, end_seconds, content')
      .ilike('content', `%${query}%`)
      .limit(limit * 3);
    if (error) throw new BadRequestException(error.message);

    const list = (segments ?? []).map((segment) => {
      const score = this.computeTextSimilarity(query, segment.content);
      return { ...segment, similarity: score };
    });

    const filtered = list
      .filter((row) => row.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    if (!filtered.length) return [];

    const videoIds = [...new Set(filtered.map((row) => row.video_id))];
    const { data: videos, error: videoError } = await supabase
      .from('videos')
      .select('id, title')
      .in('id', videoIds);
    if (videoError) throw new BadRequestException(videoError.message);

    const titleById = new Map((videos ?? []).map((video) => [video.id, video.title]));
    return filtered.map((row) => ({
      segment_id: row.id,
      video_id: row.video_id,
      video_title: titleById.get(row.video_id) ?? 'Untitled',
      start_seconds: row.start_seconds,
      end_seconds: row.end_seconds,
      content: row.content,
      similarity: row.similarity,
    }));
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
    if (this.aiProvider === 'local') {
      return this.transcribeLocal(fileBuffer, fileName);
    }

    if (!this.openai) {
      throw new InternalServerErrorException('OpenAI client not initialized');
    }
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

  private async transcribeLocal(fileBuffer: Buffer, fileName: string) {
    const baseUrl = this.localWhisperUrl.replace(/\/$/, '');
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('audio_file', blob, fileName);

    const primary = await fetch(`${baseUrl}/asr?task=transcribe&output=json`, {
      method: 'POST',
      body: formData,
    });

    let payload: Record<string, unknown> | null = null;
    if (primary.ok) {
      payload = (await primary.json()) as Record<string, unknown>;
    } else {
      const fallbackForm = new FormData();
      fallbackForm.append('file', blob, fileName);
      const fallback = await fetch(`${baseUrl}/inference`, {
        method: 'POST',
        body: fallbackForm,
      });
      if (!fallback.ok) {
        throw new BadRequestException(
          `Local whisper failed (${primary.status}/${fallback.status})`,
        );
      }
      payload = (await fallback.json()) as Record<string, unknown>;
    }

    const rawSegments = Array.isArray(payload?.segments)
      ? (payload.segments as Array<Record<string, unknown>>)
      : [];
    const segments: WhisperSegment[] = rawSegments.map((segment, idx) => ({
      id: idx,
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? segment.start ?? 0),
      text: String(segment.text ?? ''),
    }));
    const text = String(payload?.text ?? '').trim();
    const language =
      payload?.language == null ? undefined : String(payload.language);
    const duration =
      payload?.duration == null ? undefined : Number(payload.duration);

    return { text, language, duration, segments };
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

    let rows: Array<{
      video_id: string;
      transcript_id: string;
      segment_index: number;
      start_seconds: number;
      end_seconds: number;
      content: string;
      embedding?: string;
    }>;

    if (this.aiProvider === 'local') {
      rows = segments.map((segment) => ({
        video_id: videoId,
        transcript_id: transcriptId,
        segment_index: segment.segment_index,
        start_seconds: segment.start_seconds,
        end_seconds: segment.end_seconds,
        content: segment.content,
      }));
    } else {
      const embeddings = await this.embedBatch(
        segments.map((segment) => segment.content),
      );
      rows = segments.map((segment, idx) => ({
        video_id: videoId,
        transcript_id: transcriptId,
        segment_index: segment.segment_index,
        start_seconds: segment.start_seconds,
        end_seconds: segment.end_seconds,
        content: segment.content,
        embedding: this.toVectorLiteral(embeddings[idx]),
      }));
    }
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
    const content =
      this.aiProvider === 'local'
        ? await this.chatJsonLocal(prompt)
        : await this.chatJsonOpenAi(prompt);
    try {
      return JSON.parse(content) as Record<string, any>;
    } catch {
      return {};
    }
  }

  private async embedText(input: string) {
    if (this.aiProvider === 'local') {
      const vector = await this.embedTextLocal(input);
      if (!vector.length) {
        throw new InternalServerErrorException(
          'Failed to create local embedding',
        );
      }
      return vector;
    }

    if (!this.openai) {
      throw new InternalServerErrorException('OpenAI client not initialized');
    }
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
    if (this.aiProvider === 'local') {
      const vectors: number[][] = [];
      for (const input of inputs) {
        vectors.push(await this.embedTextLocal(input));
      }
      return vectors;
    }

    if (!this.openai) {
      throw new InternalServerErrorException('OpenAI client not initialized');
    }
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

  private async chatJsonOpenAi(prompt: string): Promise<string> {
    if (!this.openai) {
      throw new InternalServerErrorException('OpenAI client not initialized');
    }
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
    return completion.choices[0]?.message?.content ?? '{}';
  }

  private async chatJsonLocal(prompt: string): Promise<string> {
    const response = await fetch(`${this.ollamaUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.localChatModel,
        prompt: `Return only valid JSON. ${prompt}`,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
    });
    if (!response.ok) {
      throw new BadRequestException(
        `Local chat model request failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as { response?: string };
    return payload.response ?? '{}';
  }

  private async embedTextLocal(input: string): Promise<number[]> {
    const baseUrl = this.ollamaUrl.replace(/\/$/, '');
    const primary = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.localEmbeddingModel, prompt: input }),
    });

    if (primary.ok) {
      const data = (await primary.json()) as { embedding?: number[] };
      return data.embedding ?? [];
    }

    const fallback = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.localEmbeddingModel, input: [input] }),
    });
    if (!fallback.ok) {
      throw new BadRequestException(
        `Local embedding request failed (${primary.status}/${fallback.status})`,
      );
    }
    const payload = (await fallback.json()) as { embeddings?: number[][] };
    return payload.embeddings?.[0] ?? [];
  }

  private computeTextSimilarity(query: string, text: string): number {
    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1);
    if (!qTokens.length) return 0;
    const lowerText = text.toLowerCase();
    let hits = 0;
    for (const token of qTokens) {
      if (lowerText.includes(token)) hits += 1;
    }
    return hits / qTokens.length;
  }
}
