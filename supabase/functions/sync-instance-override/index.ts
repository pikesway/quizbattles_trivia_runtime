import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InstanceOverridePayload {
  instance_id: string;
  campaign_id: string;
  settings: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Method not allowed. Use POST.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server configuration error: Missing environment variables.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload: InstanceOverridePayload;

    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON payload.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!payload.instance_id || typeof payload.instance_id !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing or invalid required field: instance_id (must be a string).",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!payload.campaign_id || typeof payload.campaign_id !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing or invalid required field: campaign_id (must be a string).",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing or invalid required field: settings (must be an object).",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data, error } = await supabase
      .from("trivia_instance_overrides")
      .upsert(
        {
          instance_id: payload.instance_id,
          campaign_id: payload.campaign_id,
          settings: payload.settings,
        },
        {
          onConflict: "instance_id",
        }
      )
      .select("instance_id, campaign_id, updated_at")
      .single();

    if (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Database operation failed: ${error.message}`,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          instance_id: data.instance_id,
          campaign_id: data.campaign_id,
          updated_at: data.updated_at,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
