-- Migration: Add status 
-- Target table: public.profiles

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline'
CHECK (status IN ('online', 'idle', 'offline'));

-- Add index for status updates
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
