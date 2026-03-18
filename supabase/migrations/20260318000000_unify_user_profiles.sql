
-- Migration to unify profiles and users tables and fix the registration trigger
-- This ensures that users registered via Web appear in the Flutter app and vice versa.

-- 1. Create the users table if it doesn't exist (matching Flutter schema)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    photo_url TEXT,
    family_id TEXT, -- Allow null initially to avoid trigger failure
    is_location_sharing BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Update the handle_new_user function to sync both tables correctly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _display_name TEXT;
BEGIN
    -- Extract display name from metadata, supporting both 'display_name' (Web) and 'name' (Flutter)
    _display_name := COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'name',
        NEW.email
    );

    -- Sync with public.profiles (Web app)
    INSERT INTO public.profiles (user_id, display_name, created_at, updated_at)
    VALUES (NEW.id, _display_name, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET 
        display_name = EXCLUDED.display_name,
        updated_at = NOW();

    -- Sync with public.users (Flutter app compatibility)
    INSERT INTO public.users (id, name, email, family_id, is_location_sharing, created_at)
    VALUES (NEW.id, _display_name, NEW.email, '', TRUE, NOW())
    ON CONFLICT (id) DO UPDATE
    SET 
        name = EXCLUDED.name,
        email = EXCLUDED.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2.1 Enable RLS and add basic policies (if not exists)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all users"
    ON public.users FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update family members"
    ON public.users FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Sync existing data (Optional but recommended)
-- Backfill profiles from users
INSERT INTO public.profiles (user_id, display_name, created_at, updated_at)
SELECT id, name, created_at, created_at FROM public.users
ON CONFLICT (user_id) DO NOTHING;

-- Backfill users from profiles
INSERT INTO public.users (id, name, email, family_id, created_at)
SELECT p.user_id, p.display_name, u.email, '', p.created_at 
FROM public.profiles p
JOIN auth.users u ON p.user_id = u.id
ON CONFLICT (id) DO NOTHING;
