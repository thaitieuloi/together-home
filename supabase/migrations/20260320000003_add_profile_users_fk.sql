-- Add foreign key relationship from profiles(user_id) to users(id) in the public schema
-- This allows PostgREST to use 'profiles' as a child in joins directly (e.g. from users table)
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_public_users
FOREIGN KEY (user_id) REFERENCES public.users(id)
ON DELETE CASCADE;
