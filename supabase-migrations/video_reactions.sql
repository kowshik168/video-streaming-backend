-- Run this in your Supabase SQL editor to create the video_reactions table.
-- One like or one dislike per user per video (unique on video_id, user_id).

CREATE TABLE IF NOT EXISTS video_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_video_reactions_video_id ON video_reactions(video_id);
