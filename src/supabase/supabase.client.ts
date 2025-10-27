import * as dotenv from 'dotenv';
dotenv.config(); // only needed if this file is imported before main.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase URL or Key not found in environment variables.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
