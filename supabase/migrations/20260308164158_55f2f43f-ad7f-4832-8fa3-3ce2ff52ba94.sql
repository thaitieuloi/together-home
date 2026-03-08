ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS location_lng double precision;
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Family members can upload chat images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images');

CREATE POLICY "Anyone can view chat images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-images');