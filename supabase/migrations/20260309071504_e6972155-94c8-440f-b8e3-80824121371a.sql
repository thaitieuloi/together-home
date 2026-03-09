
CREATE TABLE public.live_location_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.live_location_sessions ENABLE ROW LEVEL SECURITY;

-- Family members can view active sessions
CREATE POLICY "Family members can view live sessions"
ON public.live_location_sessions
FOR SELECT
TO authenticated
USING (is_member_of_family(auth.uid(), family_id));

-- Users can create their own sessions
CREATE POLICY "Users can create own sessions"
ON public.live_location_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions (to deactivate)
CREATE POLICY "Users can update own sessions"
ON public.live_location_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own sessions
CREATE POLICY "Users can delete own sessions"
ON public.live_location_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_location_sessions;
