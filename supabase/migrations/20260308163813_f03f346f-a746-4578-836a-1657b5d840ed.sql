CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (is_member_of_family(auth.uid(), family_id));

CREATE POLICY "Family members can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND is_member_of_family(auth.uid(), family_id)
  );

CREATE INDEX idx_messages_family_created ON public.messages(family_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;