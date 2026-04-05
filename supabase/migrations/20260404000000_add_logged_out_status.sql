-- Migration: Add 'logged_out' to profiles.status constraint
-- Drops the old CHECK constraint and recreates it with 'logged_out' included.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('online', 'idle', 'offline', 'logged_out'));
