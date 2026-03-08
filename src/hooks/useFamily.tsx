import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Tables } from '@/integrations/supabase/types';

export interface FamilyMemberWithProfile {
  user_id: string;
  role: string;
  profile: Tables<'profiles'>;
  location?: Tables<'user_locations'> | null;
}

export function useFamily() {
  const { user } = useAuth();
  const [family, setFamily] = useState<Tables<'families'> | null>(null);
  const [members, setMembers] = useState<FamilyMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFamily = async () => {
    if (!user) return;
    setLoading(true);

    // Get user's family membership
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      setFamily(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    // Get family
    const { data: familyData } = await supabase
      .from('families')
      .select('*')
      .eq('id', membership.family_id)
      .single();

    setFamily(familyData);

    // Get members with profiles
    const { data: membersData } = await supabase
      .from('family_members')
      .select('user_id, role')
      .eq('family_id', membership.family_id);

    if (membersData) {
      const memberProfiles: FamilyMemberWithProfile[] = [];
      for (const m of membersData) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', m.user_id)
          .single();

        // Get latest location
        const { data: location } = await supabase
          .from('user_locations')
          .select('*')
          .eq('user_id', m.user_id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (profile) {
          memberProfiles.push({ ...m, profile, location });
        }
      }
      setMembers(memberProfiles);
    }

    setLoading(false);
  };

  const createFamily = async (name: string) => {
    if (!user) return;
    const { data: newFamily, error } = await supabase
      .from('families')
      .insert({ name, created_by: user.id })
      .select()
      .single();

    if (error) throw error;

    // Add creator as admin
    await supabase.from('family_members').insert({
      family_id: newFamily.id,
      user_id: user.id,
      role: 'admin',
    });

    await fetchFamily();
    return newFamily;
  };

  const joinFamily = async (inviteCode: string) => {
    if (!user) return;

    // Find family by invite code - use RPC or direct query
    // Since RLS blocks non-members, we need a workaround
    // We'll use an edge function or a more permissive approach
    const { data: familyData, error: findError } = await supabase
      .from('families')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (!familyData) {
      throw new Error('Mã mời không hợp lệ');
    }

    const { error } = await supabase.from('family_members').insert({
      family_id: familyData.id,
      user_id: user.id,
      role: 'member',
    });

    if (error) throw error;
    await fetchFamily();
  };

  useEffect(() => {
    fetchFamily();
  }, [user]);

  return { family, members, loading, createFamily, joinFamily, refetch: fetchFamily };
}
