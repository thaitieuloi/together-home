-- Allow admins to delete other family members
CREATE POLICY "Admins can remove family members"
ON public.family_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = family_members.family_id
    AND fm.user_id = auth.uid()
    AND fm.role = 'admin'
  )
);