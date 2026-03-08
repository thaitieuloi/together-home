
-- Bảng latest_locations (1 row per user, upsert)
CREATE TABLE public.latest_locations (
  user_id uuid PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  is_moving boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.latest_locations ENABLE ROW LEVEL SECURITY;

-- RLS: users can upsert own location
CREATE POLICY "Users can upsert own location"
  ON public.latest_locations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS: family members can view
CREATE POLICY "Family members can view latest locations"
  ON public.latest_locations FOR SELECT
  TO authenticated
  USING (public.is_family_member(auth.uid(), user_id));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.latest_locations;

-- Cleanup function for old history (>30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_locations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM user_locations WHERE timestamp < now() - interval '30 days';
END;
$$;
