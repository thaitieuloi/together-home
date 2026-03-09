
-- Add geofence notification preferences per user
CREATE TABLE public.geofence_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  geofence_id uuid NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
  notify_enter boolean NOT NULL DEFAULT true,
  notify_exit boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, geofence_id)
);

ALTER TABLE public.geofence_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prefs"
  ON public.geofence_notification_prefs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
