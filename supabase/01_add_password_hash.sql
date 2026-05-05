-- ============================================================
-- Fix Missing Password Hash & Guest Mode constraints
-- ============================================================

-- 1. Add password_hash for the custom auth system
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Remove the strict foreign key that requires profiles to exist in auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 3. Make sure the matches table also accepts our profiles
ALTER TABLE public.matches
DROP CONSTRAINT IF EXISTS matches_player1_id_fkey,
DROP CONSTRAINT IF EXISTS matches_player2_id_fkey;

ALTER TABLE public.matches
ADD CONSTRAINT matches_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT matches_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
