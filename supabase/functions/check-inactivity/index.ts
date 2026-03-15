import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * check-inactivity: Scheduled edge function (pg_cron every 15 min)
 *
 * Finds users where:
 *   is_moving = false  AND  updated_at < NOW() - threshold
 *
 * Threshold is stored in profiles.inactivity_threshold_hours (default 4h).
 * Sends a notification to all family members of the inactive user.
 * Rate-limits: does NOT re-alert within 2× threshold to avoid flooding.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { data: staleLocations } = await supabase
      .from("latest_locations")
      .select("user_id, updated_at, is_moving")
      .eq("is_moving", false)
      .lt("updated_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

    if (!staleLocations || staleLocations.length === 0) {
      return new Response(JSON.stringify({ checked: 0, alerted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let alerted = 0;

    for (const loc of staleLocations) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, inactivity_threshold_hours")
        .eq("user_id", loc.user_id)
        .single();

      const thresholdHours = profile?.inactivity_threshold_hours ?? 4;
      const inactiveSinceMs = Date.now() - new Date(loc.updated_at).getTime();
      const inactiveHours = inactiveSinceMs / (1000 * 60 * 60);

      if (inactiveHours < thresholdHours) continue;

      const { data: membership } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", loc.user_id)
        .limit(1)
        .single();

      if (!membership) continue;

      const cooldownStart = new Date(Date.now() - thresholdHours * 2 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("data->>sender_id", loc.user_id)
        .eq("type", "inactivity_alert")
        .gte("created_at", cooldownStart);

      if ((count ?? 0) > 0) continue;

      const { data: familyMembers } = await supabase
        .from("family_members")
        .select("user_id")
        .eq("family_id", membership.family_id)
        .neq("user_id", loc.user_id);

      const memberIds = familyMembers?.map((m) => m.user_id) ?? [];
      if (memberIds.length === 0) continue;

      const inactiveHoursRounded = Math.round(inactiveHours);
      await supabase.from("notifications").insert(
        memberIds.map((memberId) => ({
          user_id: memberId,
          family_id: membership.family_id,
          type: "inactivity_alert",
          title: "⚠️ Không có hoạt động",
          message: `${profile?.display_name ?? "Thành viên"} không di chuyển trong ${inactiveHoursRounded} giờ`,
          data: { sender_id: loc.user_id, inactive_hours: inactiveHoursRounded },
        }))
      );

      alerted++;
    }

    return new Response(
      JSON.stringify({ checked: staleLocations.length, alerted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
