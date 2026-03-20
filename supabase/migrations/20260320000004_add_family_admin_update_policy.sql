
-- Create a security definer function to check if a user is an admin of a family without recursion
CREATE OR REPLACE FUNCTION public.is_admin_of_family(_user_id uuid, _family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE user_id = _user_id AND family_id = _family_id AND role = 'admin'
  )
$$;

-- Allow admins to update member roles (e.g., promote to admin)
DROP POLICY IF EXISTS "Admins can update family members" ON public.family_members;
CREATE POLICY "Admins can update family members"
ON public.family_members
FOR UPDATE
TO authenticated
USING (public.is_admin_of_family(auth.uid(), family_id))
WITH CHECK (public.is_admin_of_family(auth.uid(), family_id));

-- Drop the potentially recursive delete policy and replace with one using the helper function
DROP POLICY IF EXISTS "Admins can remove family members" ON public.family_members;
CREATE POLICY "Admins can remove family members"
ON public.family_members
FOR DELETE
TO authenticated
USING (public.is_admin_of_family(auth.uid(), family_id));
