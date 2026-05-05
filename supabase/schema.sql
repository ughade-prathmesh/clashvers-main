-- ============================================================
-- CodeWars PvP — Database Upgrade
-- This version safely adds ELO without deleting existing data
-- ============================================================

-- 1. Safely add new columns to your existing 'profiles' table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS elo INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0;


-- 2. Matches Table (Create if it doesn't already exist)
DO $$ BEGIN
    CREATE TYPE match_status AS ENUM ('waiting', 'active', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE match_winner AS ENUM ('player1', 'player2', 'draw');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          match_status NOT NULL DEFAULT 'waiting',
  problem_id      TEXT NOT NULL,
  problem_title   TEXT NOT NULL,
  player1_id      UUID NOT NULL REFERENCES public.profiles(id),
  player2_id      UUID REFERENCES public.profiles(id),
  player1_code    TEXT,
  player2_code    TEXT,
  player1_lang    TEXT DEFAULT 'javascript',
  player2_lang    TEXT DEFAULT 'javascript',
  winner          match_winner,
  player1_elo_delta INTEGER DEFAULT 0,
  player2_elo_delta INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "matches_select_participants"
      ON public.matches FOR SELECT
      USING (auth.uid() = player1_id OR auth.uid() = player2_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "matches_insert_own"
      ON public.matches FOR INSERT
      WITH CHECK (auth.uid() = player1_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- 3. ELO Update Function
CREATE OR REPLACE FUNCTION public.update_elo_and_stats(
  p_winner_id   UUID,
  p_loser_id    UUID,
  p_match_id    UUID,
  p_is_draw     BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
  winner_elo INTEGER;
  loser_elo  INTEGER;
  expected_w FLOAT;
  expected_l FLOAT;
  delta_w    INTEGER;
  delta_l    INTEGER;
  k          CONSTANT INTEGER := 32;
BEGIN
  SELECT elo INTO winner_elo FROM public.profiles WHERE id = p_winner_id;
  SELECT elo INTO loser_elo  FROM public.profiles WHERE id = p_loser_id;

  -- Default to 1000 if not found
  IF winner_elo IS NULL THEN winner_elo := 1000; END IF;
  IF loser_elo IS NULL THEN loser_elo := 1000; END IF;

  expected_w := 1.0 / (1.0 + 10.0 ^ ((loser_elo  - winner_elo) / 400.0));
  expected_l := 1.0 / (1.0 + 10.0 ^ ((winner_elo - loser_elo)  / 400.0));

  IF p_is_draw THEN
    delta_w := ROUND(k * (0.5 - expected_w));
    delta_l := ROUND(k * (0.5 - expected_l));
  ELSE
    delta_w := ROUND(k * (1.0 - expected_w));
    delta_l := ROUND(k * (0.0 - expected_l));
  END IF;

  -- Update winner
  UPDATE public.profiles SET
    elo    = elo + delta_w,
    wins   = CASE WHEN NOT p_is_draw THEN wins + 1 ELSE wins END
  WHERE id = p_winner_id;

  -- Update loser
  UPDATE public.profiles SET
    elo    = GREATEST(100, elo + delta_l),
    losses = CASE WHEN NOT p_is_draw THEN losses + 1 ELSE losses END
  WHERE id = p_loser_id;

  -- Stamp deltas on the match row
  UPDATE public.matches SET
    player1_elo_delta = CASE WHEN player1_id = p_winner_id THEN delta_w ELSE delta_l END,
    player2_elo_delta = CASE WHEN player2_id = p_winner_id THEN delta_w ELSE delta_l END
  WHERE id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
