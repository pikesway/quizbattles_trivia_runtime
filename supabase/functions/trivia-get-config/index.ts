import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      // If source value is null or undefined, skip it
      if (sourceValue === null || sourceValue === undefined) {
        continue;
      }

      // If source value is an array, completely replace the target array
      if (Array.isArray(sourceValue)) {
        result[key] = sourceValue as any;
      }
      // If both values are plain objects, recursively merge them
      else if (
        typeof sourceValue === 'object' &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue) &&
        targetValue !== null
      ) {
        result[key] = deepMerge(targetValue, sourceValue) as any;
      }
      // Otherwise, directly assign the source value
      else {
        result[key] = sourceValue as any;
      }
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { template_id, instance_id } = await req.json();

    if (!template_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'template_id is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch shell from trivia_shells
    const { data: shell, error: shellError } = await supabase
      .from('trivia_shells')
      .select('internal_name, topic, config')
      .eq('id', template_id)
      .maybeSingle();

    if (shellError) {
      console.error('Error fetching shell:', shellError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch shell configuration',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!shell) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Shell not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let finalConfig = shell.config || {};

    // If instance_id is provided and not 'standalone-instance', fetch overrides
    if (instance_id && instance_id !== 'standalone-instance') {
      const { data: override, error: overrideError } = await supabase
        .from('trivia_instance_overrides')
        .select('settings')
        .eq('instance_id', instance_id)
        .maybeSingle();

      if (overrideError) {
        console.error('Error fetching instance override:', overrideError);
        // Continue with shell defaults if override fetch fails
      } else if (override?.settings) {
        // Merge override settings into shell config
        finalConfig = deepMerge(finalConfig, override.settings);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          internal_name: shell.internal_name,
          topic: shell.topic,
          config: finalConfig,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Unexpected error in trivia-get-config:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
