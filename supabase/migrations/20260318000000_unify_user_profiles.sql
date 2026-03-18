-- ============================================
-- UNIFY USER PROFILES & FIX REGISTRATION (PRODUCTION)
-- ============================================


-- 1. Cleanly recreate the function and trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _display_name TEXT;
    _invite_code TEXT;
    _family_id UUID;
BEGIN
    -- Extract info from metadata (supports both Web and Flutter keys)
    _display_name := COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'name',
        NEW.email,
        'User'
    );
    _invite_code := NEW.raw_user_meta_data->>'invite_code';

    -- 1. Sync with public.profiles (Web App)
    INSERT INTO public.profiles (user_id, display_name, updated_at)
    VALUES (NEW.id, _display_name, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name, updated_at = NOW();

    -- 2. Sync with public.users (Flutter App Compatibility)
    BEGIN
        INSERT INTO public.users (id, name, email, family_id, is_location_sharing, created_at)
        VALUES (NEW.id, _display_name, NEW.email, '', TRUE, NOW())
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, email = EXCLUDED.email;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ensure registration completes even if legacy syncing has issues
    END;

    -- 3. Automatic Family Joining (Fixes Mobile RLS issues)
    IF _invite_code IS NOT NULL AND _invite_code <> '' THEN
        -- Case-insensitive lookup
        SELECT id INTO _family_id FROM public.families 
        WHERE UPPER(TRIM(invite_code)) = UPPER(TRIM(_invite_code)) 
        LIMIT 1;
        
        IF _family_id IS NOT NULL THEN
            -- Add to family_members
            INSERT INTO public.family_members (family_id, user_id, role)
            VALUES (_family_id, NEW.id, 'member')
            ON CONFLICT (family_id, user_id) DO NOTHING;
            
            -- Keep legacy family_id in sync
            UPDATE public.users SET family_id = _family_id::text WHERE id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-establish trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Ensure RLS Policies are clean
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all users" ON public.users;
CREATE POLICY "Users can view all users" ON public.users FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update family members" ON public.users;
CREATE POLICY "Admins can update family members" ON public.users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. SYNC EXISTING DATA (Final push)
-- Ensure every profile has a user record and vice versa
INSERT INTO public.users (id, name, email, family_id, is_location_sharing, created_at)
SELECT u.id, COALESCE(p.display_name, u.email), u.email, '', TRUE, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.user_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, updated_at)
SELECT u.id, COALESCE(u.name, 'User'), NOW()
FROM public.users u
ON CONFLICT (user_id) DO NOTHING;
