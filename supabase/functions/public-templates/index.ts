import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateResponse {
  id: string;
  name: string;
  status: string;
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
      .from('trivia_shells')
      .select('id, internal_name, status')
      .or('status.eq.active,status.eq.ready')
      .order('internal_name');

    if (error) {
      throw error;
    }

    const templates: TemplateResponse[] = (shells || []).map((shell) => ({
      id: shell.id,
      name: shell.internal_name,
      status: shell.status,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: templates,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = (error as any)?.details || null;
    const errorHint = (error as any)?.hint || null;
    const errorCode = (error as any)?.code || null;

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'FETCH_TEMPLATES_FAILED',
          message: 'Failed to retrieve available templates',
          debug: {
            message: errorMessage,
            details: errorDetails,
            hint: errorHint,
            code: errorCode,
          },
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
