-- ============================================================
-- Fix Guest Mode - Allow non-authenticated users to have ELO
-- ============================================================

-- 1. Remove the strict foreign key that requires profiles to exist in auth.users
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Make sure the matches table also accepts our profiles
ALTER TABLE public.matches
DROP CONSTRAINT IF EXISTS matches_player1_id_fkey,
DROP CONSTRAINT IF EXISTS matches_player2_id_fkey;

ALTER TABLE public.matches
ADD CONSTRAINT matches_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT matches_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
