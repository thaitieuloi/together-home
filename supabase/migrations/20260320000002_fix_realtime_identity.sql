-- Set Replica Identity to FULL for critical realtime tables
-- This ensures that the 'new' record in UPDATE events includes all columns,
-- not just the changed ones and the primary key.

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
-- latest_locations should also have FULL if we want to ensure all data is received in every update
-- though user_id IS the PK there, so it's usually fine.
ALTER TABLE public.latest_locations REPLICA IDENTITY FULL;
