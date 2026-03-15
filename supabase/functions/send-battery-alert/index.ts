import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { battery_level } = await req.json();

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    const { data: userMembership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!userMembership) {
      return new Response(
        JSON.stringify({ error: "No family" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: familyMembers } = await supabase
      .from("family_members")
      .select("user_id")
      .eq("family_id", userMembership.family_id)
      .neq("user_id", user.id);

    const memberIds = familyMembers?.map((m) => m.user_id) ?? [];

    await supabase.from("notifications").insert(
      memberIds.map((memberId) => ({
        user_id: memberId,
        family_id: userMembership.family_id,
        type: "battery_low",
        title: `🔋 Pin thấp`,
        message: `${profile?.display_name ?? "Thành viên"} còn ${battery_level}% pin`,
        data: { sender_id: user.id, battery_level },
      }))
    );

    console.log(
      `Battery alert: ${profile?.display_name} at ${battery_level}%. ` +
      `Notified ${memberIds.length} members.`
    );

    return new Response(
      JSON.stringify({ success: true, notified: memberIds.length }),
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
