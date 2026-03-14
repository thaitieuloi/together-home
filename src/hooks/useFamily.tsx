import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Tables } from '@/integrations/supabase/types';

export interface FamilyMemberWithProfile {
  user_id: string;
  role: string;
  profile: Tables<'profiles'>;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: string;
    speed: number | null;
    is_moving: boolean | null;
    battery_level: number | null;
  } | null;
}

export function useFamily() {
  const { user } = useAuth();
  const [family, setFamily] = useState<Tables<'families'> | null>(null);
  const [members, setMembers] = useState<FamilyMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFamily = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get user's family membership
    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id, role')
      .eq('user_id', user.id)
      .limit(1)
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

    // Get all members in one query
    const { data: membersData } = await supabase
      .from('family_members')
      .select('user_id, role')
      .eq('family_id', membership.family_id);

    if (!membersData || membersData.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const userIds = membersData.map((m) => m.user_id);

    // Batch fetch: profiles + latest_locations in parallel
    const [profilesRes, locationsRes] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', userIds),
      supabase.from('latest_locations').select('*').in('user_id', userIds),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p]));
    const locationMap = new Map((locationsRes.data ?? []).map((l) => [l.user_id, l]));

    const memberProfiles: FamilyMemberWithProfile[] = [];
    for (const m of membersData) {
      const profile = profileMap.get(m.user_id);
      if (!profile) continue;

      const loc = locationMap.get(m.user_id);
      memberProfiles.push({
        ...m,
        profile,
        location: loc
          ? {
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy: loc.accuracy,
              timestamp: loc.updated_at,
              speed: loc.speed ?? null,
              is_moving: loc.is_moving ?? null,
              battery_level: loc.battery_level ?? null,
            }
          : null,
      });
    }

    setMembers(memberProfiles);
    setLoading(false);
  }, [user]);

  const updateMemberLocation = useCallback(
    (
      userId: string,
      lat: number,
      lng: number,
      accuracy: number | null,
      updatedAt: string,
      speed?: number | null,
      isMoving?: boolean | null,
      batteryLevel?: number | null
    ) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                location: {
                  latitude: lat,
                  longitude: lng,
                  accuracy,
                  timestamp: updatedAt,
                  speed: speed ?? null,
                  is_moving: isMoving ?? null,
                  battery_level: batteryLevel ?? null,
                },
              }
            : m
        )
      );
    },
    []
  );

  const createFamily = async (name: string) => {
    if (!user) return;
    const { data: newFamily, error } = await supabase
      .from('families')
      .insert({ name, created_by: user.id })
      .select()
      .single();

    if (error) throw error;

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

    const { data: familyData } = await supabase
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
  }, [fetchFamily]);

  return { family, members, loading, createFamily, joinFamily, refetch: fetchFamily, updateMemberLocation };
}
