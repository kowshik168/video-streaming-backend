# Video Management Backend (AI-Enhanced)

Backend API for a role-based video learning platform with:
- Topic and video management
- Authenticated video streaming
- Comments and like/dislike reactions
- Admin analytics dashboard
- AI pipeline (transcription, semantic search, chaptering, quiz generation)

## 1) Project Overview

This project is a NestJS + TypeScript backend that uses:
- `Supabase` for Auth + Postgres data
- `MinIO` for video object storage
- `OpenAI` or local `Whisper + Ollama` for AI features

The service supports both learner and admin workflows:
- Learners browse topics/videos, watch videos, comment, react, search transcripts, and take quizzes.
- Admins upload/manage content, publish quizzes, trigger AI reprocessing, and monitor platform stats.

## 2) Key Features Implemented

- **Authentication and RBAC**
  - Signup/login via Supabase Auth
  - Role resolution from `Users` profile table (`user` / `admin`)
  - Route guards with role-based authorization

- **Content Management**
  - Topic CRUD
  - Video CRUD
  - Two upload flows:
    - File path upload (`POST /videos/upload`)
    - Multipart upload (`POST /videos/upload-file`)
  - Topic-aware video creation (find-or-create topic by name)

- **Video Delivery**
  - MinIO object storage integration
  - Short-lived stream token signing and verification
  - Range request support for efficient browser playback

- **Engagement**
  - Comments per video
  - Like/dislike reactions (single reaction per user per video)

- **AI Learning Features**
  - Background AI processing jobs for uploaded videos
  - Transcript creation + timestamped segments
  - Semantic transcript search
  - Chapter generation with summaries
  - AI-generated quiz drafts + admin publish workflow
  - Quiz submission and scoring endpoint

- **Observability Features**
  - Activity logging (`signup`, `login`, content events)
  - Admin dashboard aggregate metrics and recent activity feed

## 3) Tech Stack

- **Backend:** NestJS, TypeScript
- **Auth + DB:** Supabase (`@supabase/supabase-js`)
- **Storage:** MinIO
- **AI:** OpenAI SDK (`openai`) or local Whisper + Ollama
- **Validation:** `class-validator`, `class-transformer`
- **Containerization:** Docker + Docker Compose

## 4) Module Architecture

- `auth` - signup/login and auth guards
- `topics` - topic CRUD
- `videos` - upload, CRUD, reactions, secure streaming
- `comments` - comment CRUD subset (create/list/delete)
- `ai-features` - transcription/search/chapters/quizzes pipeline
- `admin-dashboard` - analytics endpoints for admin UI
- `recent-activity` - global activity logger service
- `minio` - object storage client/service
- `supabase` - shared DB/Auth client

## 5) API Surface (Current)

### Auth
- `POST /auth/signup`
- `POST /auth/login`

### Topics
- `POST /topics`
- `GET /topics`
- `GET /topics/:id`
- `PUT /topics/:id`
- `DELETE /topics/:id`

### Videos
- `POST /videos/upload` (admin)
- `POST /videos/upload-file` (admin)
- `POST /videos` (admin)
- `PUT /videos/:id` (admin)
- `DELETE /videos/:id` (admin)
- `GET /videos/topic/:topicId`
- `GET /videos/:id`
- `GET /videos/:id/stream?token=...`
- `GET /videos/stream/:id` (presigned URL helper)
- `POST /videos/:id/reaction`
- `DELETE /videos/:id/reaction`

### Comments
- `POST /comments/:videoId`
- `GET /comments/:videoId`
- `DELETE /comments/:id`

### AI Features
- `GET /ai/search?q=...`
- `GET /ai/videos/:videoId/status`
- `GET /ai/videos/:videoId/transcript`
- `GET /ai/videos/:videoId/chapters`
- `GET /ai/videos/:videoId/quizzes` (admin)
- `GET /ai/videos/:videoId/quizzes/published`
- `PATCH /ai/quizzes/:quizId/status` (admin)
- `POST /ai/videos/:videoId/quizzes/submit`
- `POST /ai/videos/:videoId/reprocess?objectName=...` (admin)

### Admin Dashboard
- `GET /admin-dashboard/stats` (admin)

## 6) Data Model

### Base schema
Migration file: `supabase/migrations/20250206120000_initial_schema.sql`

Core tables:
- `Users` (profile + role)
- `topics`
- `videos`
- `comments`
- `recent_activity`

### Additional feature migrations
Files in `supabase-migrations`:
- `users_role_default.sql`
- `video_reactions.sql`
- `ai_content_features.sql`

AI feature tables include:
- `ai_processing_jobs`
- `lecture_transcripts`
- `transcript_segments`
- `lecture_chapters`
- `lecture_quizzes`

## 7) Local Setup

### Prerequisites
- Node.js 20+
- npm
- Docker (for MinIO and local AI services)
- Supabase project (URL + key)

### Environment
```bash
cp .env.example .env
```

Set required values in `.env`:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `AI_PROVIDER` (`local` or `openai`)

If using OpenAI:
- `OPENAI_API_KEY`
- optional model overrides (`OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`)

### Install and run
```bash
npm install
npm run start:dev
```

### Docker run
```bash
docker compose up -d
```

Services:
- Backend: `http://localhost:3000`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Whisper (local): `http://localhost:9002`
- Ollama: `http://localhost:11434`

## 8) DB Bootstrap

Run base schema first, then apply supplemental migration SQL files for reactions + AI tables.

Order:
1. `supabase/migrations/20250206120000_initial_schema.sql`
2. `supabase-migrations/users_role_default.sql`
3. `supabase-migrations/video_reactions.sql`
4. `supabase-migrations/ai_content_features.sql`

## 9) Resume-Ready Highlights

Use these as your core resume bullets:

- Built a production-style backend for an AI-enabled video learning platform using NestJS, Supabase, MinIO, and OpenAI/local LLM stack.
- Designed and shipped role-based access controls (JWT validation + RBAC guards) for admin and learner workflows across content, moderation, and analytics endpoints.
- Implemented resilient media pipeline with object storage upload, stream token signing, HTTP range-based video delivery, and cleanup rollback on failure.
- Developed AI workflow that processes lecture videos into transcripts, semantic search indexes, chapter summaries, and auto-generated quizzes with draft/publish lifecycle.
- Added learner engagement systems (comments, like/dislike reactions, quiz grading) and admin dashboard metrics from normalized relational data.
- Structured schema and migrations for scalable content and activity tracking, including pgvector-based semantic search support.

## 10) Copy-Paste Prompt For Resume Generation

Use this prompt when generating your resume/project summary:

```text
Create ATS-friendly resume bullets for my project "Video Management Backend (AI-Enhanced)".

Project context:
- Built with NestJS + TypeScript backend, Supabase Auth/Postgres, MinIO object storage, and OpenAI/local Whisper+Ollama.
- Implemented RBAC with auth guards and role checks for user/admin routes.
- Built topic/video CRUD, two upload flows (filesystem and multipart), secure streaming with short-lived token validation, and HTTP range support.
- Added comments, like/dislike reactions, and recent activity logging.
- Implemented AI pipeline: transcription, transcript segment storage, semantic search, chapter generation, quiz generation, publish workflow, and quiz grading.
- Added admin dashboard API with KPI and activity aggregation.

Generate:
1) 5-7 impact-focused resume bullets with action verbs and measurable-style wording.
2) 2 concise project descriptions (one 2-line, one 4-line).
3) 10 skills/keywords optimized for ATS.
Focus on backend architecture, AI integration, data modeling, and API engineering impact.
```

## 11) Known Current Gaps (Snapshot)

These are current improvement opportunities in the codebase:

- No automated test suite currently exists (`*.spec.ts` not present).
- Validation is inconsistent: some endpoints use DTO pipes, others accept raw body fields.
- Auth endpoints and guards include console logging of operational details that should be reduced in production.
- Main schema and supplemental migrations are split across two folders, increasing setup drift risk.
- AI background jobs are in-process and not backed by durable queue workers.
- Dashboard metrics include placeholder values for views/storage in current implementation.

## 12) Scripts

```bash
npm run start
npm run start:dev
npm run build
npm run start:prod
npm run lint
```
