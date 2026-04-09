import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_STATUSES = ["draft", "active", "paused", "ended"] as const;
type InstanceStatus = typeof VALID_STATUSES[number];

interface SyncPayload {
  instance_id: string;
  campaign_id: string;
  status: InstanceStatus;
  start_time: string | null;
  end_time: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed. Use POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: SyncPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.instance_id || typeof payload.instance_id !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid required field: instance_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.campaign_id || typeof payload.campaign_id !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid required field: campaign_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.status || !VALID_STATUSES.includes(payload.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Missing or invalid field: status. Must be one of: ${VALID_STATUSES.join(", ")}.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("trivia_instance_overrides")
      .upsert(
        {
          instance_id: payload.instance_id,
          campaign_id: payload.campaign_id,
          status: payload.status,
          start_time: payload.start_time ?? null,
          end_time: payload.end_time ?? null,
        },
        {
          onConflict: "instance_id",
          ignoreDuplicates: false,
        }
      )
      .select("instance_id, campaign_id, status, start_time, end_time, updated_at")
      .single();

    if (error) {
      console.error("Upsert error:", error);
      return new Response(
        JSON.stringify({ success: false, error: `Database operation failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error in sync-instance-override:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
