-- Migration: Add status_updated_at to profiles
-- This column records when status last transitioned (source of truth for idle/offline time display).
-- A trigger maintains it automatically — client code does NOT need to write it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows with current timestamp as best-effort baseline
UPDATE public.profiles SET status_updated_at = updated_at WHERE status_updated_at IS NULL;

-- Trigger function: update status_updated_at only when status actually changes
CREATE OR REPLACE FUNCTION public.set_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_status_updated_at ON public.profiles;

CREATE TRIGGER trg_set_status_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_status_updated_at();
