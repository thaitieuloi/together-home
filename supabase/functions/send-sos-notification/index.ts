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

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { latitude, longitude } = await req.json();

    // Get user's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    // Get family members
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

    // Get all family members' push tokens (except sender)
    const { data: familyMembers } = await supabase
      .from("family_members")
      .select("user_id")
      .eq("family_id", userMembership.family_id)
      .neq("user_id", user.id);

    if (familyMembers && familyMembers.length > 0) {
      const userIds = familyMembers.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("push_token")
        .in("user_id", userIds)
        .not("push_token", "is", null);

      // Log for now - push notification sending would go here
      // when FCM/APNs is configured
      console.log(
        `SOS from ${profile?.display_name} at ${latitude},${longitude}. ` +
        `Notifying ${profiles?.length ?? 0} members with push tokens.`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `SOS sent from ${profile?.display_name}`,
        location: { latitude, longitude },
      }),
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
