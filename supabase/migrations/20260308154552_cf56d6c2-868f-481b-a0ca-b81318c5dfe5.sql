
-- Drop the recursive policy
DROP POLICY IF EXISTS "Members can view family members" ON public.family_members;

-- Create a security definer function to check family membership without recursion
CREATE OR REPLACE FUNCTION public.is_member_of_family(_user_id uuid, _family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE user_id = _user_id AND family_id = _family_id
  )
$$;

-- Recreate policy using the security definer function
CREATE POLICY "Members can view family members"
ON public.family_members
FOR SELECT
TO authenticated
USING (public.is_member_of_family(auth.uid(), family_id));
