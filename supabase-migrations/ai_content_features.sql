-- AI-assisted learning features:
-- 1) transcription + timestamped segments
-- 2) semantic search with pgvector embeddings
-- 3) chapter summaries
-- 4) AI-generated quizzes with publish workflow

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')) DEFAULT 'queued',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lecture_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  language TEXT,
  duration_seconds DOUBLE PRECISION,
  full_text TEXT NOT NULL,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  transcript_id UUID NOT NULL REFERENCES lecture_transcripts(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_seconds DOUBLE PRECISION NOT NULL,
  end_seconds DOUBLE PRECISION NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_video_id ON transcript_segments(video_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_embedding_cosine ON transcript_segments USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS lecture_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  start_seconds DOUBLE PRECISION NOT NULL,
  end_seconds DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS idx_lecture_chapters_video_id ON lecture_chapters(video_id);

CREATE TABLE IF NOT EXISTS lecture_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option_index INTEGER NOT NULL CHECK (correct_option_index BETWEEN 0 AND 3),
  explanation TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  generated_by_ai BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecture_quizzes_video_id ON lecture_quizzes(video_id);
CREATE INDEX IF NOT EXISTS idx_lecture_quizzes_status ON lecture_quizzes(status);

CREATE OR REPLACE FUNCTION search_transcript_segments(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.6
)
RETURNS TABLE (
  segment_id UUID,
  video_id UUID,
  video_title TEXT,
  start_seconds DOUBLE PRECISION,
  end_seconds DOUBLE PRECISION,
  content TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
AS $$
  SELECT
    s.id AS segment_id,
    s.video_id,
    v.title AS video_title,
    s.start_seconds,
    s.end_seconds,
    s.content,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM transcript_segments s
  JOIN videos v ON v.id = s.video_id
  WHERE s.embedding IS NOT NULL
    AND (1 - (s.embedding <=> query_embedding)) >= similarity_threshold
    AND v.is_active = true
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;
