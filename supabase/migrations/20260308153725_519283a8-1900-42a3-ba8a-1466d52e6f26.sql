
-- Allow anyone authenticated to look up a family by invite code (for joining)
CREATE POLICY "Anyone can look up family by invite code" ON public.families
FOR SELECT TO authenticated
USING (true);

-- Drop the old restrictive select policy
DROP POLICY IF EXISTS "Members can view their families" ON public.families;
