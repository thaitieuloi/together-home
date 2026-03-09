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
  const R = 6371e3;
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
        JSON.stringify({ events: [] }),
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
        JSON.stringify({ events: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get last known geofence events for this user (to detect transitions)
    const geofenceIds = geofences.map((g) => g.id);
    const { data: lastEvents } = await supabase
      .from("geofence_events")
      .select("geofence_id, event_type")
      .eq("user_id", user_id)
      .in("geofence_id", geofenceIds)
      .order("created_at", { ascending: false });

    // Build map of last event per geofence
    const lastEventMap = new Map<string, string>();
    if (lastEvents) {
      for (const ev of lastEvents) {
        if (!lastEventMap.has(ev.geofence_id)) {
          lastEventMap.set(ev.geofence_id, ev.event_type);
        }
      }
    }

    // Check each geofence for transitions
    const events: Array<{ geofence_id: string; geofence_name: string; event_type: string }> = [];

    for (const fence of geofences) {
      const dist = haversineDistance(latitude, longitude, fence.latitude, fence.longitude);
      const isInside = dist <= fence.radius_meters;
      const lastEvent = lastEventMap.get(fence.id);

      let eventType: string | null = null;

      if (isInside && lastEvent !== "enter") {
        // User just entered (or first time inside)
        eventType = "enter";
      } else if (!isInside && (lastEvent === "enter" || lastEvent === undefined)) {
        // User just exited (or first time outside with no prior event - skip first time outside)
        if (lastEvent === "enter") {
          eventType = "exit";
        }
      }

      if (eventType) {
        events.push({
          geofence_id: fence.id,
          geofence_name: fence.name,
          event_type: eventType,
        });

        // Record the event
        await supabase.from("geofence_events").insert({
          user_id,
          geofence_id: fence.id,
          event_type: eventType,
        });
      }
    }

    // Send notifications to family members for any events
    if (events.length > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user_id)
        .single();

      const { data: familyMembers } = await supabase
        .from("family_members")
        .select("user_id")
        .eq("family_id", membership.family_id)
        .neq("user_id", user_id);

      if (familyMembers && familyMembers.length > 0) {
        const userName = profile?.display_name || "Thành viên";

        const notifications = [];
        for (const ev of events) {
          const isEnter = ev.event_type === "enter";
          const title = isEnter ? "📍 Đã đến vùng an toàn" : "⚠️ Rời khỏi vùng an toàn";
          const body = isEnter
            ? `${userName} đã đến ${ev.geofence_name}`
            : `${userName} đã rời khỏi ${ev.geofence_name}`;

          for (const member of familyMembers) {
            notifications.push({
              user_id: member.user_id,
              title,
              body,
              type: "geofence",
              metadata: {
                geofence_id: ev.geofence_id,
                geofence_name: ev.geofence_name,
                event_type: ev.event_type,
                triggered_by: user_id,
                triggered_by_name: userName,
              },
            });
          }
        }

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }

        console.log(
          `Geofence events: ${events.map((e) => `${e.event_type}:${e.geofence_name}`).join(", ")}. ` +
          `Notified ${familyMembers.length} members.`
        );
      }
    }

    return new Response(
      JSON.stringify({ events }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
