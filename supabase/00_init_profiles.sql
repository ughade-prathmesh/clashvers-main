-- ============================================================
-- Initial Setup - Create Profiles Table
-- ============================================================

-- Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: The fix_guest_mode.sql will later drop the foreign key constraint
-- to allow guest users who are not in auth.users.
