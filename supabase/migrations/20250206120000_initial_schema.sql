-- Video Management – initial schema for Supabase
-- Run this in Supabase SQL Editor or via: supabase db push
-- All PKs and FKs are defined so you can fetch data accurately with joins.
--
-- PK/FK relation summary:
--   auth.users (Supabase Auth)
--     ← public."Users".auth_user_id (optional link)
--     ← public.comments.user_id
--     ← public.recent_activity.user_id
--   public.topics (id)
--     ← public.videos.topic_id
--     ← public.recent_activity.topic_id (optional)
--   public.videos (id)
--     ← public.comments.video_id
--     ← public.recent_activity.video_id (optional)
--   public.comments (id)
--     ← public.recent_activity.comment_id (optional)

-- =============================================================================
-- Users (profile table; auth lives in auth.users)
-- =============================================================================
create table if not exists public."Users" (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,  -- optional: set when linking profile to auth
  email_id text not null unique,
  user_name text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create index if not exists idx_users_auth_user_id on public."Users"(auth_user_id);
create index if not exists idx_users_email_id on public."Users"(email_id);

-- =============================================================================
-- Topics
-- =============================================================================
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Videos (FK → topics)
-- =============================================================================
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  title text not null,
  description text,
  video_path text not null,
  is_active boolean not null default true,
  tryout_link text,
  created_at timestamptz not null default now()
);

create index if not exists idx_videos_topic_id on public.videos(topic_id);
create index if not exists idx_videos_is_active_created_at on public.videos(is_active, created_at desc);

-- =============================================================================
-- Comments (FK → videos, FK → auth.users)
-- =============================================================================
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_video_id on public.comments(video_id);
create index if not exists idx_comments_user_id on public.comments(user_id);

-- =============================================================================
-- Recent activity (FK → auth.users, optional FKs → video / comment / topic)
-- =============================================================================
create table if not exists public.recent_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'video_created', 'video_updated', 'video_deleted',
    'comment_created', 'comment_deleted',
    'topic_created', 'topic_updated', 'topic_deleted',
    'login', 'signup'
  )),
  video_id uuid references public.videos(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_recent_activity_user_id on public.recent_activity(user_id);
create index if not exists idx_recent_activity_created_at on public.recent_activity(created_at desc);
create index if not exists idx_recent_activity_video_id on public.recent_activity(video_id) where video_id is not null;
create index if not exists idx_recent_activity_comment_id on public.recent_activity(comment_id) where comment_id is not null;
create index if not exists idx_recent_activity_topic_id on public.recent_activity(topic_id) where topic_id is not null;

-- Optional: enable RLS and add policies if you use anon key from a frontend
-- alter table public."Users" enable row level security;
-- alter table public.topics enable row level security;
-- alter table public.videos enable row level security;
-- alter table public.comments enable row level security;
-- alter table public.recent_activity enable row level security;
