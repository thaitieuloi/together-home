
-- Table to track geofence events (entry/exit)
CREATE TABLE public.geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  geofence_id uuid NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('enter', 'exit')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own geofence events"
  ON public.geofence_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Family members can view geofence events"
  ON public.geofence_events FOR SELECT
  TO authenticated
  USING (is_family_member(auth.uid(), user_id));

-- Notifications table for in-app notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'geofence',
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role needs to insert notifications for other users
CREATE POLICY "Service can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Index for fast lookups
CREATE INDEX idx_geofence_events_user_geofence ON public.geofence_events(user_id, geofence_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = false;
