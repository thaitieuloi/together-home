ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token text;

CREATE TABLE public.sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  message text DEFAULT 'SOS - Cần giúp đỡ!',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own SOS" ON public.sos_alerts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Family members can view SOS" ON public.sos_alerts
  FOR SELECT TO authenticated
  USING (is_family_member(auth.uid(), user_id));

CREATE TABLE public.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters double precision NOT NULL DEFAULT 500,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view geofences" ON public.geofences
  FOR SELECT TO authenticated
  USING (is_member_of_family(auth.uid(), family_id));

CREATE POLICY "Admins can manage geofences" ON public.geofences
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = geofences.family_id
      AND family_members.user_id = auth.uid()
      AND family_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete geofences" ON public.geofences
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = geofences.family_id
      AND family_members.user_id = auth.uid()
      AND family_members.role = 'admin'
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;