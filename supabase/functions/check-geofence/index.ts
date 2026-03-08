import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371e3; // meters
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id, latitude, longitude } = await req.json();

    if (!user_id || !latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: "Missing user_id, latitude, or longitude" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's family
    const { data: membership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", user_id)
      .limit(1)
      .single();

    if (!membership) {
      return new Response(
        JSON.stringify({ violations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get geofences for this family
    const { data: geofences } = await supabase
      .from("geofences")
      .select("*")
      .eq("family_id", membership.family_id);

    if (!geofences || geofences.length === 0) {
      return new Response(
        JSON.stringify({ violations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check each geofence
    const violations = geofences
      .filter((fence) => {
        const dist = haversineDistance(
          latitude, longitude,
          fence.latitude, fence.longitude
        );
        return dist > fence.radius_meters;
      })
      .map((fence) => ({
        geofence_id: fence.id,
        geofence_name: fence.name,
        distance: Math.round(
          haversineDistance(latitude, longitude, fence.latitude, fence.longitude)
        ),
        radius: fence.radius_meters,
      }));

    if (violations.length > 0) {
      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, push_token")
        .eq("user_id", user_id)
        .single();

      // Get family members to notify
      const { data: familyMembers } = await supabase
        .from("family_members")
        .select("user_id")
        .eq("family_id", membership.family_id)
        .neq("user_id", user_id);

      if (familyMembers && familyMembers.length > 0) {
        const userIds = familyMembers.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("push_token, display_name")
          .in("user_id", userIds)
          .not("push_token", "is", null);

        console.log(
          `Geofence violation: ${profile?.display_name} left ${violations.map((v) => v.geofence_name).join(", ")}. ` +
          `Notifying ${profiles?.length ?? 0} members.`
        );
      }
    }

    return new Response(
      JSON.stringify({ violations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
