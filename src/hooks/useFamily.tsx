import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Tables } from '@/integrations/supabase/types';

export interface FamilyMemberWithProfile {
  user_id: string;
  role: string;
  profile: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    status: 'online' | 'idle' | 'offline' | 'logged_out';
    status_updated_at: string | null;
    updated_at: string;
    push_token: string | null;
  };
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
    const { data: memberships } = await supabase
      .from('family_members')
      .select('family_id, role')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      console.warn('[useFamily] No family membership found for user:', user.id);
      setFamily(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    // For now, take the first family, but log if there are multiple
    if (memberships.length > 1) {
      console.info('[useFamily] User belongs to multiple families:', memberships);
    }
    const membership = memberships[0];

    // Get family
    const { data: familyData } = await supabase
      .from('families')
      .select('*')
      .eq('id', membership.family_id)
      .single();

    if (!familyData) {
      console.error('[useFamily] Family not found for ID:', membership.family_id);
      setLoading(false);
      return;
    }

    setFamily(familyData);

    // Get all members
    const { data: membersData } = await supabase
      .from('family_members')
      .select('user_id, role')
      .eq('family_id', membership.family_id);

    console.log(`[useFamily] Found ${membersData?.length || 0} members in family_members for family:`, familyData.name);

    if (!membersData || membersData.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const userIds = membersData.map((m) => m.user_id);

    // Batch fetch: profiles + latest_locations in parallel
    // Also fetch from 'users' table as fallback for names
    const [profilesRes, locationsRes, usersRes] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', userIds),
      supabase.from('latest_locations').select('*').in('user_id', userIds),
      supabase.from('users' as any).select('*').in('id', userIds),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p]));
    const locationMap = new Map((locationsRes.data ?? []).map((l) => [l.user_id, l]));
    const legacyUserMap = new Map(((usersRes.data as any[]) ?? []).map((u) => [u.id, u]));

    const memberProfiles: FamilyMemberWithProfile[] = [];
    for (const m of membersData) {
      const profile = profileMap.get(m.user_id);
      const legacyUser = legacyUserMap.get(m.user_id);
      
      const finalizedProfile = {
        user_id: m.user_id,
        display_name: profile?.display_name || legacyUser?.name || 'Unknown User',
        avatar_url: profile?.avatar_url || legacyUser?.photo_url || null,
        status: (profile as any)?.status || 'offline',
        status_updated_at: (profile as any)?.status_updated_at || null,
        created_at: profile?.created_at || legacyUser?.created_at || new Date().toISOString(),
        updated_at: profile?.updated_at || legacyUser?.updated_at || new Date().toISOString(),
        push_token: profile?.push_token || null,
      };

      const loc = locationMap.get(m.user_id);
      memberProfiles.push({
        ...m,
        profile: finalizedProfile as any,
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

  const updateMemberProfile = useCallback(
    (userId: string, updates: Partial<FamilyMemberWithProfile['profile']>) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                profile: { ...m.profile, ...updates },
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

    // Also update legacy users table for Flutter compatibility
    try {
      await supabase.from('users' as any).update({ family_id: newFamily.id }).eq('id', user.id);
    } catch (usersErr) {
      console.warn('Sync to legacy users table failed:', usersErr);
    }

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

    // Also update legacy users table for Flutter compatibility
    try {
      await supabase.from('users' as any).update({ family_id: familyData.id }).eq('id', user.id);
    } catch (usersErr) {
      console.warn('Sync to legacy users table failed:', usersErr);
    }

    await fetchFamily();
  };

  useEffect(() => {
    fetchFamily();
  }, [fetchFamily]);

  return { family, members, loading, createFamily, joinFamily, refetch: fetchFamily, updateMemberLocation, updateMemberProfile };
}
