-- Ensure "role" in Users is never null: set default so any insert without role gets 'user'.
-- Run this in your Supabase SQL editor if you see: null value in column "role" of relation "Users" violates not-null constraint

ALTER TABLE "Users"
  ALTER COLUMN role SET DEFAULT 'user';

-- Optional: backfill any existing rows that have null role (if any)
-- UPDATE "Users" SET role = 'user' WHERE role IS NULL;
