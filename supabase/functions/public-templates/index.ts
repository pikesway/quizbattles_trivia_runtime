import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateResponse {
  id: string;
  display_name: string;
  slug: string;
  status: string;
  topic: string;
  tags: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: shells, error } = await supabase
      .from('shells')
      .select('id, internal_name, slug, status, topic, tags')
      .or('status.eq.active,status.eq.ready')
      .order('internal_name');

    if (error) {
      throw error;
    }

    const templates: TemplateResponse[] = (shells || []).map((shell) => ({
      id: shell.id,
      display_name: shell.internal_name,
      slug: shell.slug,
      status: shell.status,
      topic: shell.topic,
      tags: shell.tags || [],
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: templates,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'FETCH_TEMPLATES_FAILED',
          message: 'Failed to retrieve available templates'
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
